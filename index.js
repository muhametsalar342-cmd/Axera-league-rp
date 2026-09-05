// AXERA LEAGUE - DISCORD.JS V14
// Node.js >= 18.17
// TOKEN ortam değişkeninden alınır.

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

const TEAMS = Object.keys(TEAM_ROLE_IDS);

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let database = {};

if (fs.existsSync(DATA_FILE)) {
    try {
        database = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
        database = {};
    }
}

function saveDatabase() {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(database, null, 2)
    );
}

function getGuildDB(guildId) {
    if (!database[guildId]) {
        database[guildId] = {
            players: {},
            budgets: {},
            teams: {},
            fixtures: [],
            matches: [],
            trophies: [],
            assists: {},
            registrationSessions: {}
        };
    }

    const g = database[guildId];

    if (!g.players) g.players = {};
    if (!g.budgets) g.budgets = {};
    if (!g.teams) g.teams = {};
    if (!g.fixtures) g.fixtures = [];
    if (!g.matches) g.matches = [];
    if (!g.trophies) g.trophies = [];
    if (!g.assists) g.assists = {};
    if (!g.registrationSessions) g.registrationSessions = {};

    return g;
}

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
        Partials.Channel,
        Partials.Message,
        Partials.User
    ]
});

/* =========================================================
   YARDIMCI FONKSİYONLAR
========================================================= */

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

function hasAnyRole(member, ids) {
    return ids.some(id => hasRole(member, id));
}

function normalize(text) {
    return String(text || "")
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/İ/g, "i")
        .replace(/ş/g, "s")
        .replace(/Ş/g, "s")
        .replace(/ğ/g, "g")
        .replace(/Ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/Ü/g, "u")
        .replace(/ö/g, "o")
        .replace(/Ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/Ç/g, "c")
        .replace(/\s+/g, " ")
        .trim();
}

function formatMoney(value) {
    return `${Math.max(0, Number(value) || 0)}M€`;
}

function parseMoney(value) {
    if (!value) return null;

    const clean = String(value)
        .replace(/m€/gi, "")
        .replace(/[€$]/g, "")
        .replace(",", ".")
        .trim();

    const number = Number(clean);

    if (!Number.isFinite(number) || number < 0) {
        return null;
    }

    return number;
}

function getChannel(guild, id, fallbackNames = []) {
    let channel = guild.channels.cache.get(id);

    if (channel) return channel;

    const names = fallbackNames.map(normalize);

    return guild.channels.cache.find(
        c =>
            c.isTextBased() &&
            names.includes(normalize(c.name))
    );
}

function getRole(guild, id, fallbackName = null) {
    let role = guild.roles.cache.get(id);

    if (role) return role;

    if (!fallbackName) return null;

    return guild.roles.cache.find(
        r => normalize(r.name) === normalize(fallbackName)
    );
}

function findTeamByRole(guild, roleId) {
    return TEAMS.find(
        team => TEAM_ROLE_IDS[team] === roleId
    ) || null;
}

function findTeam(name) {
    const n = normalize(name);

    return TEAMS.find(
        team => normalize(team) === n
    ) || null;
}

function findTeamFromMention(guild, text) {
    const match = String(text || "")
        .match(/^<@&(\d+)>$/);

    if (!match) return null;

    const role = guild.roles.cache.get(match[1]);

    if (!role) return null;

    return findTeamByRole(guild, role.id);
}

function findMentionId(text) {
    const match = String(text || "")
        .match(/^<@!?(\d+)>$/);

    return match ? match[1] : null;
}

function getTeamRole(guild, team) {
    const id = TEAM_ROLE_IDS[team];

    if (!id) return null;

    return guild.roles.cache.get(id) || null;
}

/* =========================================================
   TAKIM PARSE SİSTEMİ
   ETİKET + ÇOK KELİMELİ TAKIM DESTEKLER
========================================================= */

function parseTeamToken(guild, token) {
    return (
        findTeamFromMention(guild, token) ||
        findTeam(token)
    );
}

function parseTwoTeams(guild, args) {
    if (args.length < 2) return null;

    /*
      Önce direkt iki argüman.
      Örnek:
      @Galatasaray @Fenerbahçe
    */

    const direct1 = parseTeamToken(guild, args[0]);
    const direct2 = parseTeamToken(guild, args[1]);

    if (direct1 && direct2) {
        return {
            team1: direct1,
            team2: direct2
        };
    }

    /*
      Çok kelimeli takım isimleri.
    */

    const text = args.join(" ");

    const sorted = [...TEAMS].sort(
        (a, b) => b.length - a.length
    );

    for (const team1 of sorted) {
        const a = normalize(team1);

        if (!normalize(text).startsWith(a)) {
            continue;
        }

        const rest = normalize(text)
            .slice(a.length)
            .trim();

        const team2 = sorted.find(
            t => normalize(t) === rest
        );

        if (team2) {
            return {
                team1,
                team2
            };
        }
    }

    return null;
}

/* =========================================================
   OYUNCU
========================================================= */

function ensurePlayer(guildDB, userId) {
    if (!guildDB.players[userId]) {
        guildDB.players[userId] = {
            userId,
            nickname: "Oyuncu",
            position: "Oyuncu",
            value: 0,
            team: null,
            training: 0,
            goals: 0,
            assists: 0,
            registered: false
        };
    }

    return guildDB.players[userId];
}

function getPlayer(guild, userId) {
    return getGuildDB(guild.id).players[userId] || null;
}

function setPlayerValue(guild, userId, amount) {
    const g = getGuildDB(guild.id);
    const player = ensurePlayer(g, userId);

    player.value = Math.max(
        0,
        Number(amount) || 0
    );

    saveDatabase();

    return player.value;
}

async function updateNickname(guild, userId) {
    const player = getPlayer(guild, userId);

    if (!player) return;

    const member = await guild.members
        .fetch(userId)
        .catch(() => null);

    if (!member) return;

    const current = member.nickname || member.user.username;

    const cleaned = current
        .replace(/\s*\|\s*\d+(?:[.,]\d+)?\s*M€\s*$/i, "")
        .trim();

    const nickname =
        `${cleaned} | ${formatMoney(player.value)}`;

    await member.setNickname(
        nickname.slice(0, 32)
    ).catch(() => {});
}

/* =========================================================
   KAYIT
========================================================= */

const registrationSessions = new Map();

async function startRegistration(message, target, nickname) {
    const g = getGuildDB(message.guild.id);

    if (!target) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.kayitYetkilisi
        )
    ) {
        return message.reply(
            "❌ Bu komut için Kayıt Yetkilisi olmalısın."
        );
    }

    const player = ensurePlayer(
        g,
        target.id
    );

    player.nickname =
        nickname ||
        target.displayName ||
        target.user.username;

    player.registered = false;

    g.registrationSessions[target.id] = {
        nickname: player.nickname,
        createdBy: message.author.id
    };

    saveDatabase();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `register_kaleci_${target.id}`
                )
                .setLabel("Kaleci")
                .setEmoji("🧤")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(
                    `register_uye_${target.id}`
                )
                .setLabel("Üye")
                .setEmoji("👤")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(
                    `register_futbolcu_${target.id}`
                )
                .setLabel("Futbolcu")
                .setEmoji("⚽")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(
                    `register_td_${target.id}`
                )
                .setLabel("Teknik Direktör")
                .setEmoji("📋")
                .setStyle(ButtonStyle.Danger)
        );

    return message.channel.send({
        content:
            `👤 **Kayıt:** ${target}\n` +
            `📝 İsim: **${player.nickname}**\n\n` +
            `Oyuncu türünü seçin:`,
        components: [row]
    });
}

async function completeRegistration(
    interaction,
    type,
    userId
) {
    if (
        !isOwner(interaction.member) &&
        !hasRole(
            interaction.member,
            ROLE_IDS.kayitYetkilisi
        )
    ) {
        return interaction.reply({
            content:
                "❌ Bu butonu sadece Kayıt Yetkilisi kullanabilir.",
            ephemeral: true
        });
    }

    if (interaction.user.id === userId) {
        /*
          İstenirse kayıt yetkilisinin kendi hesabını
          kayıt etmesini engellememek için burada
          özellikle işlem yok.
        */
    }

    const guild = interaction.guild;
    const g = getGuildDB(guild.id);
    const player = ensurePlayer(g, userId);

    const member = await guild.members
        .fetch(userId)
        .catch(() => null);

    if (!member) {
        return interaction.reply({
            content: "❌ Üye bulunamadı.",
            ephemeral: true
        });
    }

    const allRegistrationRoles = [
        ROLE_IDS.kayitsiz,
        ROLE_IDS.kaleci,
        ROLE_IDS.uye,
        ROLE_IDS.futbolcu,
        ROLE_IDS.teknikDirektor
    ];

    for (const roleId of allRegistrationRoles) {
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId)
                .catch(() => {});
        }
    }

    let roleId;
    let label;

    if (type === "kaleci") {
        roleId = ROLE_IDS.kaleci;
        label = "Kaleci";
        player.position = "Kaleci";
    }

    if (type === "uye") {
        roleId = ROLE_IDS.uye;
        label = "Üye";
        player.position = "Üye";
    }

    if (type === "futbolcu") {
        roleId = ROLE_IDS.futbolcu;
        label = "Futbolcu";
        player.position = "Futbolcu";
    }

    if (type === "td") {
        roleId = ROLE_IDS.teknikDirektor;
        label = "Teknik Direktör";
        player.position = "Teknik Direktör";
    }

    if (!roleId) {
        return interaction.reply({
            content: "❌ Geçersiz kayıt türü.",
            ephemeral: true
        });
    }

    await member.roles.add(roleId)
        .catch(() => {});

    player.registered = true;

    delete g.registrationSessions[userId];

    saveDatabase();

    await interaction.update({
        content:
            `✅ **Kayıt tamamlandı!**\n\n` +
            `👤 Oyuncu: ${member}\n` +
            `📌 Tür: **${label}**\n` +
            `💰 Değer: **${formatMoney(player.value)}**`,
        components: []
    });

    const chat =
        getChannel(
            guild,
            CHANNEL_IDS.sohbet,
            ["sohbet"]
        );

    if (chat) {
        chat.send(
            `🎉 Hoş geldin ${member}! **Axera League** ailesine başarıyla kayıt oldun.`
        ).catch(() => {});
    }
}

/* =========================================================
   YENİ ÜYE
========================================================= */

client.on("guildMemberAdd", async member => {
    const role =
        getRole(
            member.guild,
            ROLE_IDS.kayitsiz,
            "Kayıtsız"
        );

    if (role) {
        await member.roles.add(role)
            .catch(() => {});
    }

    const channel =
        getChannel(
            member.guild,
            CHANNEL_IDS.kayit,
            ["kayıt", "kayit"]
        );

    if (channel) {
        const kayitRole =
            getRole(
                member.guild,
                ROLE_IDS.kayitYetkilisi,
                "Kayıt Yetkilisi"
            );

        await channel.send(
            `${member} sunucuya katıldı.\n` +
            `📝 Kayıt işlemi için ${kayitRole || "Kayıt Yetkilisi"} ilgilenebilir.`
        ).catch(() => {});
    }
});

/* =========================================================
   ANTRENMAN
========================================================= */

async function trainingCommand(message) {
    if (
        message.channel.id !== CHANNEL_IDS.antrenman
    ) {
        return message.reply(
            `❌ Bu komut sadece <#${CHANNEL_IDS.antrenman}> kanalında kullanılabilir.`
        );
    }

    const g = getGuildDB(message.guild.id);
    const player = ensurePlayer(
        g,
        message.author.id
    );

    if (!player.registered) {
        return message.reply(
            "❌ Önce kayıt olmalısın."
        );
    }

    if (
        player.position !== "Futbolcu" &&
        player.position !== "Kaleci"
    ) {
        return message.reply(
            "❌ Antrenman sistemini sadece futbolcular kullanabilir."
        );
    }

    if (player.training >= 5) {
        return message.reply(
            `🏋️ Antrenmanın zaten **5/5** tamamlandı.\n` +
            `💰 Oyuncu değerin: **${formatMoney(player.value)}**`
        );
    }

    player.training++;

    let text =
        `🏋️ **ANTRENMAN**\n\n` +
        `👤 Oyuncu: ${message.author}\n` +
        `📈 İlerleme: **${player.training}/5**`;

    if (player.training >= 5) {
        player.value += 5;

        text +=
            `\n\n🎉 **ANTRENMAN TAMAMLANDI!**` +
            `\n💰 Oyuncu değerine **+5M€** eklendi.` +
            `\n💎 Yeni değer: **${formatMoney(player.value)}**`;
    }

    saveDatabase();

    await updateNickname(
        message.guild,
        message.author.id
    );

    return message.reply(text);
}

/* =========================================================
   PENALTI
========================================================= */

async function penaltyCommand(message) {
    if (
        message.channel.id !== CHANNEL_IDS.penalti
    ) {
        return message.reply(
            `❌ Bu komut sadece <#${CHANNEL_IDS.penalti}> kanalında kullanılabilir.`
        );
    }

    const g = getGuildDB(message.guild.id);
    const player = ensurePlayer(
        g,
        message.author.id
    );

    if (!player.registered) {
        return message.reply(
            "❌ Önce kayıt olmalısın."
        );
    }

    const random = Math.random() * 100;

    let result;

    if (random < 30) {
        result = "goal";
    } else if (random < 60) {
        result = "keeper";
    } else if (random < 85) {
        result = "post";
    } else {
        result = "corner";
    }

    if (result === "goal") {
        player.value += 5;

        saveDatabase();

        await updateNickname(
            message.guild,
            message.author.id
        );

        return message.reply(
            `⚽ **GOOOL!**\n\n` +
            `🎯 Penaltı gol oldu!\n` +
            `💰 Oyuncu değerine **+5M€** eklendi.\n` +
            `💎 Yeni değer: **${formatMoney(player.value)}**`
        );
    }

    if (result === "keeper") {
        return message.reply(
            `🧤 **KALECİ KURTARDI!**\n\n` +
            `💰 Değer değişmedi.`
        );
    }

    if (result === "post") {
        return message.reply(
            `🥅 **DİREK!**\n\n` +
            `💰 Değer değişmedi.`
        );
    }

    return message.reply(
        `🚩 **KORNER!**\n\n` +
        `💰 Değer değişmedi.`
    );
}

/* =========================================================
   DEĞER
========================================================= */

async function valueCommand(message, args, add) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.degerYetkilisi
        )
    ) {
        return message.reply(
            "❌ Değer Yetkilisi olmalısın."
        );
    }

    const userId =
        findMentionId(args[0]);

    if (!userId) {
        return message.reply(
            "❌ Oyuncuyu etiketle."
        );
    }

    const amount =
        parseMoney(args[1]);

    if (amount === null) {
        return message.reply(
            "❌ Geçerli bir miktar yaz."
        );
    }

    const g = getGuildDB(message.guild.id);
    const player = ensurePlayer(
        g,
        userId
    );

    if (add) {
        player.value += amount;
    } else {
        player.value =
            Math.max(
                0,
                player.value - amount
            );
    }

    saveDatabase();

    await updateNickname(
        message.guild,
        userId
    );

    return message.reply(
        `✅ ${message.guild.members.cache.get(userId) || `<@${userId}>`}\n` +
        `💎 Yeni oyuncu değeri: **${formatMoney(player.value)}**`
    );
}

/* =========================================================
   BÜTÇE
========================================================= */

async function budgetCommand(message) {
    const g = getGuildDB(message.guild.id);

    const amount =
        g.budgets[message.author.id] || 0;

    return message.reply(
        `💳 **Kişisel Bütçen**\n\n` +
        `💰 Bütçe: **${formatMoney(amount)}**`
    );
}

async function budgetGive(message, args) {
    const targetId =
        findMentionId(args[0]);

    const amount =
        parseMoney(args[1]);

    if (!targetId || amount === null || amount <= 0) {
        return message.reply(
            "❌ Kullanım: `.gönder @oyuncu 10M`"
        );
    }

    if (targetId === message.author.id) {
        return message.reply(
            "❌ Kendine para gönderemezsin."
        );
    }

    const g = getGuildDB(message.guild.id);

    const sender =
        g.budgets[message.author.id] || 0;

    if (sender < amount) {
        return message.reply(
            `❌ Yeterli bütçen yok.\n` +
            `💰 Bütçen: **${formatMoney(sender)}**`
        );
    }

    g.budgets[message.author.id] =
        sender - amount;

    g.budgets[targetId] =
        (g.budgets[targetId] || 0) + amount;

    saveDatabase();

    return message.reply(
        `✅ <@${targetId}> kullanıcısına **${formatMoney(amount)}** gönderildi.`
    );
}

async function budgetAdmin(
    message,
    args,
    add
) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.degerYetkilisi
        )
    ) {
        return message.reply(
            "❌ Değer Yetkilisi olmalısın."
        );
    }

    const id =
        findMentionId(args[0]);

    const amount =
        parseMoney(args[1]);

    if (!id || amount === null) {
        return message.reply(
            "❌ Kullanım: `.bütçeekle @oyuncu 10M`"
        );
    }

    const g = getGuildDB(message.guild.id);

    g.budgets[id] =
        Math.max(
            0,
            (g.budgets[id] || 0) +
            (add ? amount : -amount)
        );

    saveDatabase();

    return message.reply(
        `✅ Yeni bütçe: **${formatMoney(g.budgets[id])}**`
    );
}

/* =========================================================
   KAP / TRANSFER
========================================================= */

const kapOffers = new Map();

async function kapCommand(message, args) {
    const targetId =
        findMentionId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    if (args.length < 4) {
        return message.reply(
            "❌ Kullanım:\n`.kap @Oyuncu @Takım 10M 3`"
        );
    }

    const salary =
        parseMoney(
            args[args.length - 2]
        );

    const seasons =
        Number(
            args[args.length - 1]
        );

    if (
        salary === null ||
        !Number.isInteger(seasons) ||
        seasons < 1 ||
        seasons > 10
    ) {
        return message.reply(
            "❌ Maaş veya sezon sayısı hatalı. Sezon 1-10 arası olmalı."
        );
    }

    const teamArgs =
        args.slice(
            1,
            args.length - 2
        );

    const team =
        parseTeamToken(
            message.guild,
            teamArgs.join(" ")
        );

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı. Takım rolünü etiketleyebilirsin."
        );
    }

    const g = getGuildDB(message.guild.id);
    const player = ensurePlayer(g, targetId);

    if (!player.registered) {
        return message.reply(
            "❌ Bu oyuncu kayıtlı değil."
        );
    }

    if (
        player.position !== "Futbolcu"
    ) {
        return message.reply(
            "❌ Sadece futbolcular transfer edilebilir."
        );
    }

    if (player.team) {
        return message.reply(
            `❌ Oyuncunun zaten takımı var: **${player.team}**`
        );
    }

    const teamRole =
        getTeamRole(
            message.guild,
            team
        );

    const authorized =
        isOwner(message.member) ||
        hasRole(
            message.member,
            ROLE_IDS.teknikDirektor
        ) ||
        (teamRole &&
            hasRole(
                message.member,
                teamRole.id
            ));

    if (!authorized) {
        return message.reply(
            "❌ KAP açmak için Teknik Direktör, takım rolü veya Owner olmalısın."
        );
    }

    const offerId =
        `${message.guild.id}-${Date.now()}`;

    kapOffers.set(
        offerId,
        {
            playerId: targetId,
            team,
            salary,
            seasons,
            createdBy: message.author.id
        }
    );

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `kap_accept_${offerId}`
                    )
                    .setLabel("Kabul Et")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(
                        `kap_reject_${offerId}`
                    )
                    .setLabel("Reddet")
                    .setStyle(ButtonStyle.Danger)
            );

    return message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("📄 KAP TRANSFER TEKLİFİ")
                .setDescription(
                    `👤 Oyuncu: <@${targetId}>\n` +
                    `🏟️ Takım: **${team}**\n` +
                    `💰 Sezonluk maaş: **${formatMoney(salary)}**\n` +
                    `📅 Sözleşme: **${seasons} sezon**\n` +
                    `💳 Toplam maaş: **${formatMoney(salary * seasons)}**`
                )
        ],
        components: [row]
    });
}

async function handleKapButton(interaction) {
    const parts =
        interaction.customId.split("_");

    const action = parts[1];
    const offerId = parts.slice(2).join("_");

    const offer =
        kapOffers.get(offerId);

    if (!offer) {
        return interaction.reply({
            content:
                "❌ Bu KAP teklifi artık geçerli değil.",
            ephemeral: true
        });
    }

    if (
        interaction.user.id !== offer.playerId
    ) {
        return interaction.reply({
            content:
                "❌ Bu teklif sadece oyuncuya aittir.",
            ephemeral: true
        });
    }

    if (action === "reject") {
        kapOffers.delete(offerId);

        return interaction.update({
            content:
                `❌ <@${offer.playerId}> transfer teklifini reddetti.`,
            embeds: [],
            components: []
        });
    }

    const g =
        getGuildDB(
            interaction.guild.id
        );

    const player =
        ensurePlayer(
            g,
            offer.playerId
        );

    if (player.team) {
        kapOffers.delete(offerId);

        return interaction.update({
            content:
                "❌ Oyuncunun zaten bir takımı var.",
            embeds: [],
            components: []
        });
    }

    player.team = offer.team;

    if (!g.teams[offer.team]) {
        g.teams[offer.team] = {
            players: []
        };
    }

    if (
        !g.teams[offer.team].players
            .includes(offer.playerId)
    ) {
        g.teams[offer.team].players.push(
            offer.playerId
        );
    }

    const role =
        getTeamRole(
            interaction.guild,
            offer.team
        );

    if (role) {
        const member =
            await interaction.guild.members
                .fetch(offer.playerId)
                .catch(() => null);

        if (member) {
            await member.roles.add(role)
                .catch(() => {});
        }
    }

    saveDatabase();
    kapOffers.delete(offerId);

    return interaction.update({
        content:
            `✅ Transfer tamamlandı!\n\n` +
            `👤 <@${offer.playerId}>\n` +
            `🏟️ **${offer.team}**\n` +
            `💰 Maaş: **${formatMoney(offer.salary)}**\n` +
            `📅 Sözleşme: **${offer.seasons} sezon**`,
        embeds: [],
        components: []
    });
}

/* =========================================================
   KADRO
========================================================= */

function getTeamPlayers(guildDB, team) {
    if (!guildDB.teams[team]) {
        guildDB.teams[team] = {
            players: []
        };
    }

    return guildDB.teams[team].players
        .map(id => guildDB.players[id])
        .filter(Boolean);
}

function teamTotalValue(guildDB, team) {
    return getTeamPlayers(
        guildDB,
        team
    ).reduce(
        (sum, p) => sum + Number(p.value || 0),
        0
    );
}

async function squadAdd(message, args) {
    const playerId =
        args.map(findMentionId)
            .find(Boolean);

    if (!playerId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    const teamMention =
        args.find(
            a =>
                !!findTeamFromMention(
                    message.guild,
                    a
                )
        );

    let team =
        teamMention
            ? findTeamFromMention(
                message.guild,
                teamMention
            )
            : null;

    if (!team) {
        /*
          Etiket yoksa takım adını bul.
        */
        const withoutMention =
            args.filter(
                a => !findMentionId(a)
            );

        const positionIndex =
            withoutMention.length - 1;

        const teamText =
            withoutMention
                .slice(0, positionIndex)
                .join(" ");

        team = findTeam(teamText);
    }

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    const position =
        args[args.length - 1];

    const g =
        getGuildDB(
            message.guild.id
        );

    const player =
        ensurePlayer(
            g,
            playerId
        );

    if (!player.registered) {
        return message.reply(
            "❌ Oyuncu kayıtlı değil."
        );
    }

    const teamRole =
        getTeamRole(
            message.guild,
            team
        );

    const authorized =
        isOwner(message.member) ||
        hasRole(
            message.member,
            ROLE_IDS.spiker
        ) ||
        hasRole(
            message.member,
            ROLE_IDS.teknikDirektor
        ) ||
        (teamRole &&
            hasRole(
                message.member,
                teamRole.id
            ));

    if (!authorized) {
        return message.reply(
            "❌ Kadro düzenleme yetkin yok."
        );
    }

    if (!g.teams[team]) {
        g.teams[team] = {
            players: []
        };
    }

    if (
        !g.teams[team].players
            .includes(playerId)
    ) {
        g.teams[team].players.push(
            playerId
        );
    }

    player.team = team;
    player.position =
        position || player.position;

    saveDatabase();

    return message.reply(
        `✅ <@${playerId}> kadroya eklendi.\n` +
        `🏟️ Takım: **${team}**\n` +
        `📌 Pozisyon: **${player.position}**`
    );
}

async function squadRemove(message, args) {
    const playerId =
        args.map(findMentionId)
            .find(Boolean);

    if (!playerId) {
        return message.reply(
            "❌ Oyuncuyu etiketlemelisin."
        );
    }

    let team =
        args
            .map(a =>
                findTeamFromMention(
                    message.guild,
                    a
                )
            )
            .find(Boolean);

    if (!team) {
        team =
            findTeam(
                args
                    .filter(
                        a => !findMentionId(a)
                    )
                    .join(" ")
            );
    }

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    if (g.teams[team]) {
        g.teams[team].players =
            g.teams[team].players
                .filter(
                    id => id !== playerId
                );
    }

    const player =
        g.players[playerId];

    if (player && player.team === team) {
        player.team = null;
    }

    const role =
        getTeamRole(
            message.guild,
            team
        );

    const member =
        await message.guild.members
            .fetch(playerId)
            .catch(() => null);

    if (member && role) {
        await member.roles.remove(role)
            .catch(() => {});
    }

    saveDatabase();

    return message.reply(
        `✅ <@${playerId}> **${team}** kadrosundan çıkarıldı.`
    );
}

async function squadShow(message, args) {
    const team =
        parseTeamToken(
            message.guild,
            args.join(" ")
        );

    if (!team) {
        return message.reply(
            "❌ Takım bulunamadı."
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    const players =
        getTeamPlayers(g, team);

    const lines =
        players.length
            ? players.map(
                (p, i) =>
                    `**${i + 1}.** <@${p.userId}> — ` +
                    `${p.position} — ${formatMoney(p.value)}`
            ).join("\n")
            : "Kadro boş.";

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(`👥 ${team} KADROSU`)
                .setDescription(lines)
                .addFields({
                    name: "💰 Takım Değeri",
                    value:
                        `**${formatMoney(
                            teamTotalValue(g, team)
                        )}**`
                })
        ]
    });
}

/* =========================================================
   KAYITSIZ VER
========================================================= */

async function unregisteredCommand(
    message,
    args
) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.kayitYetkilisi
        )
    ) {
        return message.reply(
            "❌ Kayıt Yetkilisi olmalısın."
        );
    }

    const id =
        findMentionId(args[0]);

    if (!id) {
        return message.reply(
            "❌ Oyuncuyu etiketle."
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    const player =
        g.players[id];

    if (!player) {
        return message.reply(
            "❌ Oyuncu kayıt verisi bulunamadı."
        );
    }

    const member =
        await message.guild.members
            .fetch(id)
            .catch(() => null);

    if (!member) {
        return message.reply(
            "❌ Üye bulunamadı."
        );
    }

    if (player.team) {
        const team =
            player.team;

        if (g.teams[team]) {
            g.teams[team].players =
                g.teams[team].players
                    .filter(
                        x => x !== id
                    );
        }

        const teamRole =
            getTeamRole(
                message.guild,
                team
            );

        if (teamRole) {
            await member.roles
                .remove(teamRole)
                .catch(() => {});
        }
    }

    const rolesToRemove = [
        ROLE_IDS.kaleci,
        ROLE_IDS.uye,
        ROLE_IDS.futbolcu,
        ROLE_IDS.teknikDirektor
    ];

    for (const roleId of rolesToRemove) {
        await member.roles
            .remove(roleId)
            .catch(() => {});
    }

    await member.roles
        .add(ROLE_IDS.kayitsiz)
        .catch(() => {});

    player.registered = false;
    player.team = null;

    saveDatabase();

    return message.reply(
        `✅ ${member} tekrar **Kayıtsız** yapıldı.`
    );
}

/* =========================================================
   OYUNCU ARAMA
========================================================= */

async function searchPlayers(
    message,
    query
) {
    const g =
        getGuildDB(
            message.guild.id
        );

    const q =
        normalize(query);

    if (!q) {
        return message.reply(
            "❌ Aramak istediğin oyuncuyu yaz."
        );
    }

    const results =
        Object.values(g.players)
            .filter(
                p =>
                    p.registered &&
                    normalize(
                        p.nickname
                    ).includes(q)
            )
            .slice(0, 15);

    if (!results.length) {
        return message.reply(
            "❌ Oyuncu bulunamadı."
        );
    }

    const text =
        results.map(
            p =>
                `👤 <@${p.userId}> — **${p.nickname}** — ` +
                `${p.position} — ${formatMoney(p.value)}`
        ).join("\n");

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🔎 OYUNCU ARAMA")
                .setDescription(text)
        ]
    });
}

/* =========================================================
   PUAN TABLOSU
========================================================= */

function buildTable(guildDB) {
    const rows = [];

    for (const team of TEAMS) {
        if (!guildDB.teams[team]) {
            guildDB.teams[team] = {
                players: []
            };
        }

        const existing =
            guildDB.teams[team].stats || {
                p: 0,
                w: 0,
                d: 0,
                l: 0,
                gf: 0,
                ga: 0,
                points: 0
            };

        rows.push({
            team,
            ...existing,
            gd: existing.gf - existing.ga
        });
    }

    rows.sort(
        (a, b) =>
            b.points - a.points ||
            b.gd - a.gd ||
            b.gf - a.gf
    );

    return rows;
}

async function updateStandings(guild) {
    const g =
        getGuildDB(guild.id);

    const channel =
        getChannel(
            guild,
            CHANNEL_IDS.puan,
            ["puan", "puan-tablosu"]
        );

    if (!channel) return;

    const rows =
        buildTable(g);

    const text =
        rows.map(
            (r, i) =>
                `**${i + 1}. ${r.team}** — ` +
                `P: ${r.p} | W: ${r.w} | D: ${r.d} | L: ${r.l} | ` +
                `GF: ${r.gf} | GA: ${r.ga} | GD: ${r.gd} | ` +
                `🏆 ${r.points}`
        ).join("\n");

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("📊 AXERA LEAGUE PUAN DURUMU")
                .setDescription(text)
        ]
    }).catch(() => {});
}

function applyMatchResult(
    g,
    team1,
    team2,
    score1,
    score2
) {
    for (const team of [team1, team2]) {
        if (!g.teams[team]) {
            g.teams[team] = {
                players: []
            };
        }

        if (!g.teams[team].stats) {
            g.teams[team].stats = {
                p: 0,
                w: 0,
                d: 0,
                l: 0,
                gf: 0,
                ga: 0,
                points: 0
            };
        }
    }

    const a =
        g.teams[team1].stats;

    const b =
        g.teams[team2].stats;

    a.p++;
    b.p++;

    a.gf += score1;
    a.ga += score2;

    b.gf += score2;
    b.ga += score1;

    if (score1 > score2) {
        a.w++;
        b.l++;
        a.points += 3;
    } else if (score2 > score1) {
        b.w++;
        a.l++;
        b.points += 3;
    } else {
        a.d++;
        b.d++;
        a.points++;
        b.points++;
    }
}

/* =========================================================
   MAÇ
========================================================= */

const activeMatches = new Map();

function randomPlayer(
    players,
    team
) {
    if (!players.length) {
        return {
            name: `${team} NPC`,
            npc: true
        };
    }

    return players[
        Math.floor(
            Math.random() * players.length
        )
    ];
}

async function startMatch(
    message,
    team1,
    team2
) {
    const key =
        `${message.guild.id}-${team1}-${team2}`;

    if (activeMatches.has(key)) {
        return message.reply(
            "❌ Bu maç zaten oynanıyor."
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    const p1 =
        getTeamPlayers(
            g,
            team1
        );

    const p2 =
        getTeamPlayers(
            g,
            team2
        );

    const match = {
        key,
        guildId: message.guild.id,
        team1,
        team2,
        score1: 0,
        score2: 0,
        minute: 0,
        finished: false
    };

    activeMatches.set(key, match);

    const channel =
        getChannel(
            message.guild,
            CHANNEL_IDS.mac,
            ["maç", "mac"]
        ) || message.channel;

    const sent =
        await channel.send(
            `⚽ **MAÇ BAŞLADI!**\n\n` +
            `🏟️ **${team1} 0 - 0 ${team2}**`
        );

    match.messageId = sent.id;

    const interval =
        setInterval(
            async () => {
                if (match.finished) {
                    clearInterval(interval);
                    return;
                }

                match.minute++;

                if (
                    Math.random() < 0.035
                ) {
                    const attackingTeam =
                        Math.random() < 0.5
                            ? team1
                            : team2;

                    const players =
                        attackingTeam === team1
                            ? p1
                            : p2;

                    const player =
                        randomPlayer(
                            players,
                            attackingTeam
                        );

                    if (
                        attackingTeam === team1
                    ) {
                        match.score1++;
                    } else {
                        match.score2++;
                    }

                    await channel.send(
                        `⚽ **${match.minute}' GOL!** ` +
                        `**${attackingTeam}**\n` +
                        `👤 ${player.name || "Oyuncu"}`
                    ).catch(() => {});
                }

                if (
                    match.minute === 45
                ) {
                    await channel.send(
                        `⏸️ **DEVRE ARASI**\n` +
                        `${team1} **${match.score1} - ${match.score2}** ${team2}`
                    ).catch(() => {});
                }

                if (
                    match.minute >= 90
                ) {
                    match.finished = true;

                    clearInterval(interval);

                    applyMatchResult(
                        g,
                        team1,
                        team2,
                        match.score1,
                        match.score2
                    );

                    g.matches.push({
                        team1,
                        team2,
                        score1: match.score1,
                        score2: match.score2,
                        date: Date.now()
                    });

                    saveDatabase();

                    await channel.send(
                        `🏁 **MAÇ SONA ERDİ!**\n\n` +
                        `🏟️ **${team1} ${match.score1} - ${match.score2} ${team2}**`
                    ).catch(() => {});

                    await updateStandings(
                        message.guild
                    );

                    activeMatches.delete(key);
                }
            },
            3000
        );
}

/* =========================================================
   TARİH
========================================================= */

function parseDateTime(
    dateText,
    timeText
) {
    const dateMatch =
        String(dateText)
            .match(
                /^(\d{4})-(\d{2})-(\d{2})$/
            );

    const timeMatch =
        String(timeText)
            .match(
                /^(\d{1,2}):(\d{2})$/
            );

    if (!dateMatch || !timeMatch) {
        return null;
    }

    const year =
        Number(dateMatch[1]);

    const month =
        Number(dateMatch[2]) - 1;

    const day =
        Number(dateMatch[3]);

    const hour =
        Number(timeMatch[1]);

    const minute =
        Number(timeMatch[2]);

    if (
        month < 0 ||
        month > 11 ||
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
            month,
            day,
            hour,
            minute,
            0
        );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date.getTime();
}

/* =========================================================
   FİKSTÜR
   ÖNEMLİ: TAKIMLAR ETİKETLENEBİLİR
========================================================= */

async function fixtureAdd(
    message,
    args
) {
    if (
        !isOwner(message.member) &&
        !hasRole(
            message.member,
            ROLE_IDS.spiker
        )
    ) {
        return message.reply(
            "❌ Fikstür eklemek için Spiker yetkisi gerekir."
        );
    }

    if (args.length < 4) {
        return message.reply(
            "❌ Kullanım:\n" +
            "`.fiksturekle @Galatasaray @Fenerbahçe 2026-09-10 20:00`"
        );
    }

    const dateText =
        args[args.length - 2];

    const timeText =
        args[args.length - 1];

    const timestamp =
        parseDateTime(
            dateText,
            timeText
        );

    if (!timestamp) {
        return message.reply(
            "❌ Tarih/saat hatalı.\n" +
            "Örnek: `.fiksturekle @Galatasaray @Fenerbahçe 2026-09-10 20:00`"
        );
    }

    const teamArgs =
        args.slice(
            0,
            args.length - 2
        );

    /*
      Öncelik:
      @Galatasaray @Fenerbahçe
    */

    let team1 =
        parseTeamToken(
            message.guild,
            teamArgs[0]
        );

    let team2 =
        parseTeamToken(
            message.guild,
            teamArgs[1]
        );

    /*
      Eğer iki ayrı etiket bulunamadıysa
      çok kelimeli isimleri kontrol et.
    */

    if (!team1 || !team2) {
        const parsed =
            parseTwoTeams(
                message.guild,
                teamArgs
            );

        if (parsed) {
            team1 = parsed.team1;
            team2 = parsed.team2;
        }
    }

    if (!team1 || !team2) {
        return message.reply(
            "❌ Takım bulunamadı.\n\n" +
            "Takım rollerini etiketleyerek kullan:\n" +
            "`.fiksturekle @Galatasaray @Fenerbahçe 2026-09-10 20:00`"
        );
    }

    if (team1 === team2) {
        return message.reply(
            "❌ Aynı takımla fikstür oluşturamazsın."
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    const fixture = {
        id:
            `${message.guild.id}-${Date.now()}`,
        team1,
        team2,
        timestamp,
        status: "scheduled",
        score1: null,
        score2: null,
        messageId: null
    };

    g.fixtures.push(fixture);

    const channel =
        getChannel(
            message.guild,
            CHANNEL_IDS.fikstur,
            ["fikstür", "fikstur"]
        );

    if (!channel) {
        g.fixtures =
            g.fixtures.filter(
                x => x.id !== fixture.id
            );

        saveDatabase();

        return message.reply(
            "❌ Fikstür kanalı bulunamadı."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "📅 AXERA LEAGUE FİKSTÜR"
            )
            .setDescription(
                `🏟️ **${team1}** ⚔️ **${team2}**\n\n` +
                `🗓️ Tarih: **${dateText}**\n` +
                `🕐 Saat: **${timeText}**\n` +
                `🟡 Durum: **Bekliyor**`
            );

    const sent =
        await channel.send({
            embeds: [embed]
        });

    fixture.messageId =
        sent.id;

    saveDatabase();

    return message.reply(
        `✅ Fikstür oluşturuldu!\n\n` +
        `🏟️ **${team1} vs ${team2}**\n` +
        `🗓️ **${dateText} ${timeText}**`
    );
}

/* =========================================================
   FİKSTÜR SCHEDULER
========================================================= */

async function checkFixtures() {
    const now =
        Date.now();

    for (const guild of client.guilds.cache.values()) {
        const g =
            getGuildDB(guild.id);

        for (const fixture of g.fixtures) {
            if (
                fixture.status !== "scheduled"
            ) {
                continue;
            }

            if (
                fixture.timestamp > now
            ) {
                continue;
            }

            fixture.status = "live";

            saveDatabase();

            const fakeMessage = {
                guild,
                member: guild.members.me,
                channel:
                    getChannel(
                        guild,
                        CHANNEL_IDS.mac,
                        ["maç", "mac"]
                    ),
                author: guild.members.me?.user,
                reply: async content => {
                    if (typeof content === "string") {
                        return fakeMessage.channel?.send(
                            content
                        );
                    }

                    return fakeMessage.channel?.send(
                        content
                    );
                }
            };

            await startMatch(
                fakeMessage,
                fixture.team1,
                fixture.team2
            ).catch(console.error);
        }
    }
}

setInterval(
    checkFixtures,
    15000
);

/* =========================================================
   PUAN
========================================================= */

async function standingsCommand(message) {
    const g =
        getGuildDB(
            message.guild.id
        );

    const rows =
        buildTable(g);

    const text =
        rows.map(
            (r, i) =>
                `**${i + 1}. ${r.team}**\n` +
                `P ${r.p} | W ${r.w} | D ${r.d} | L ${r.l} | ` +
                `GF ${r.gf} | GA ${r.ga} | GD ${r.gd} | ` +
                `🏆 ${r.points}`
        ).join("\n\n");

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "📊 AXERA LEAGUE PUAN DURUMU"
                )
                .setDescription(
                    text || "Henüz maç oynanmadı."
                )
        ]
    });
}

/* =========================================================
   DM
========================================================= */

async function dmCommand(
    message,
    args
) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Bu komut için Yönetici/Owner olmalısın."
        );
    }

    if (args[0]?.toLowerCase() === "all") {
        const text =
            args.slice(1).join(" ");

        if (!text) {
            return message.reply(
                "❌ Mesaj yaz."
            );
        }

        await message.reply(
            "📩 DM gönderimi başlatıldı..."
        );

        let success = 0;
        let failed = 0;

        for (
            const member of
            message.guild.members.cache.values()
        ) {
            if (member.user.bot) continue;

            await member.send(text)
                .then(() => success++)
                .catch(() => failed++);

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        400
                    )
            );
        }

        return message.channel.send(
            `📩 **DM tamamlandı.**\n` +
            `✅ Başarılı: **${success}**\n` +
            `❌ Başarısız: **${failed}**`
        );
    }

    const targetId =
        findMentionId(args[0]);

    if (!targetId) {
        return message.reply(
            "❌ Kullanım: `.dm @oyuncu mesaj`"
        );
    }

    const text =
        args.slice(1).join(" ");

    if (!text) {
        return message.reply(
            "❌ Mesaj yaz."
        );
    }

    const member =
        await message.guild.members
            .fetch(targetId)
            .catch(() => null);

    if (!member) {
        return message.reply(
            "❌ Üye bulunamadı."
        );
    }

    await member.send(text);

    return message.reply(
        `✅ ${member} kullanıcısına DM gönderildi.`
    );
}

/* =========================================================
   MODERASYON
========================================================= */

async function deleteMessages(
    message,
    args
) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici olmalısın."
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
            "❌ 1-100 arasında sayı gir."
        );
    }

    const messages =
        await message.channel
            .bulkDelete(
                amount,
                true
            )
            .catch(() => null);

    if (!messages) {
        return message.reply(
            "❌ Mesajlar silinemedi."
        );
    }

    return message.channel.send(
        `🗑️ **${messages.size}** mesaj silindi.`
    );
}

async function lockChannel(
    message,
    unlock
) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici olmalısın."
        );
    }

    await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
            SendMessages: unlock
        }
    );

    return message.reply(
        unlock
            ? "🔓 Kanal açıldı."
            : "🔒 Kanal kilitlendi."
    );
}

/* =========================================================
   EMBED
========================================================= */

async function embedCommand(
    message,
    args
) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici olmalısın."
        );
    }

    const text =
        args.join(" ");

    const [title, description] =
        text.split("|").map(
            x => x?.trim()
        );

    if (!title || !description) {
        return message.reply(
            "❌ Kullanım: `.embed Başlık | Açıklama`"
        );
    }

    return message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
        ]
    });
}

/* =========================================================
   ROL VER
========================================================= */

async function roleGive(
    message,
    args
) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici olmalısın."
        );
    }

    const userId =
        findMentionId(args[0]);

    if (!userId) {
        return message.reply(
            "❌ Üyeyi etiketle."
        );
    }

    const roleMention =
        args.find(
            x => /^<@&\d+>$/.test(x)
        );

    if (!roleMention) {
        return message.reply(
            "❌ Rolü etiketle."
        );
    }

    const roleId =
        roleMention.match(
            /^<@&(\d+)>$/
        )[1];

    const role =
        message.guild.roles.cache.get(
            roleId
        );

    const member =
        await message.guild.members
            .fetch(userId)
            .catch(() => null);

    if (!role || !member) {
        return message.reply(
            "❌ Rol veya üye bulunamadı."
        );
    }

    await member.roles.add(role);

    return message.reply(
        `✅ ${member} kullanıcısına ${role} verildi.`
    );
}

/* =========================================================
   KUPA
========================================================= */

async function trophyAdd(
    message,
    args
) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici olmalısın."
        );
    }

    const team =
        parseTeamToken(
            message.guild,
            args[0]
        );

    const trophy =
        args.slice(1).join(" ");

    if (!team || !trophy) {
        return message.reply(
            "❌ Kullanım: `.kupaekle @Takım Kupa Adı`"
        );
    }

    const g =
        getGuildDB(
            message.guild.id
        );

    g.trophies.push({
        team,
        trophy,
        date: Date.now()
    });

    saveDatabase();

    return message.reply(
        `🏆 **${team}** takımına **${trophy}** kupası eklendi.`
    );
}

async function trophyRemove(
    message,
    args
) {
    if (!isAdmin(message.member)) {
        return message.reply(
            "❌ Yönetici olmalısın."
        );
    }

    const team =
        parseTeamToken(
            message.guild,
            args[0]
        );

    const trophy =
        args.slice(1).join(" ");

    const g =
        getGuildDB(
            message.guild.id
        );

    const before =
        g.trophies.length;

    g.trophies =
        g.trophies.filter(
            x =>
                !(
                    x.team === team &&
                    x.trophy === trophy
                )
        );

    saveDatabase();

    return message.reply(
        before === g.trophies.length
            ? "❌ Kupa bulunamadı."
            : "✅ Kupa silindi."
    );
}

/* =========================================================
   ASİST KRALI
========================================================= */

async function assistKing(
    message
) {
    const g =
        getGuildDB(
            message.guild.id
        );

    const players =
        Object.values(g.players)
            .sort(
                (a, b) =>
                    (b.assists || 0) -
                    (a.assists || 0)
            )
            .slice(0, 10);

    if (!players.length) {
        return message.reply(
            "❌ Henüz asist verisi yok."
        );
    }

    const text =
        players.map(
            (p, i) =>
                `**${i + 1}.** <@${p.userId}> — ` +
                `🎯 **${p.assists || 0} asist**`
        ).join("\n");

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    "🎯 ASİST KRALLIĞI"
                )
                .setDescription(text)
        ]
    });
}

/* =========================================================
   DURUM
========================================================= */

function uptimeText() {
    const sec =
        Math.floor(
            process.uptime()
        );

    const hours =
        Math.floor(sec / 3600);

    const minutes =
        Math.floor(
            (sec % 3600) / 60
        );

    return `${hours} saat ${minutes} dakika`;
}

async function sendStatus() {
    const now =
        new Date();

    const time =
        now.toLocaleTimeString(
            "tr-TR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    for (
        const guild of
        client.guilds.cache.values()
    ) {
        const channel =
            getChannel(
                guild,
                CHANNEL_IDS.durum,
                ["bot-durum", "durum"]
            );

        if (!channel) continue;

        await channel.send(
            `🤖 **BOT DURUMU**\n` +
            `🟢 Tüm sistemler sorunsuz çalışıyor.\n` +
            `⏱️ Çalışma Süresi: **${uptimeText()}**\n` +
            `🕐 Son Kontrol: **${time}**`
        ).catch(() => {});
    }
}

/* =========================================================
   YARDIM
========================================================= */

async function helpCommand(message) {
    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("📚 AXERA LEAGUE KOMUTLARI")
                .setDescription(
                    "**👤 Kayıt**\n" +
                    "`.k @oyuncu TakmaAdı`\n" +
                    "`.kayıtsızver @oyuncu`\n" +
                    "`.ara oyuncu`\n\n" +

                    "**⚽ Oyuncu**\n" +
                    "`.ant` / `.antrenman`\n" +
                    "`.pen` / `.penaltı`\n" +
                    "`.dver @oyuncu 5M`\n" +
                    "`.dsil @oyuncu 5M`\n\n" +

                    "**💳 Bütçe**\n" +
                    "`.bütçe`\n" +
                    "`.gönder @oyuncu 5M`\n" +
                    "`.bütçeekle @oyuncu 5M`\n" +
                    "`.bütçesil @oyuncu 5M`\n\n" +

                    "**💼 Transfer**\n" +
                    "`.kap @oyuncu @takım 10M 3`\n\n" +

                    "**👥 Kadro**\n" +
                    "`.kadro @takım`\n" +
                    "`.kadroekle @takım @oyuncu Pozisyon`\n" +
                    "`.kadrosil @takım @oyuncu`\n\n" +

                    "**⚽ Maç**\n" +
                    "`.maç @takım1 @takım2`\n\n" +

                    "**📅 Fikstür**\n" +
                    "`.fiksturekle @takım1 @takım2 2026-09-10 20:00`\n" +
                    "`.puan`\n\n" +

                    "**🛡️ Yönetim**\n" +
                    "`.sil 10`\n" +
                    "`.kilit`\n" +
                    "`.aç`\n" +
                    "`.embed Başlık | Açıklama`\n" +
                    "`.rolver @üye @rol`\n" +
                    "`.dm @üye mesaj`\n" +
                    "`.dm all mesaj`\n\n" +

                    "**🏆 Diğer**\n" +
                    "`.kupaekle @takım Kupa`\n" +
                    "`.kupasil @takım Kupa`\n" +
                    "`.asistkral`\n"
                )
        ]
    });
}

/* =========================================================
   MESAJ EVENT
========================================================= */

client.on(
    "messageCreate",
    async message => {
        try {
            if (
                !message.guild ||
                message.author.bot
            ) {
                return;
            }

            if (!message.content.startsWith(".")) {
                return;
            }

            const args =
                message.content
                    .slice(1)
                    .trim()
                    .split(/\s+/);

            const command =
                normalize(
                    args.shift()
                );

            if (!command) return;

            /* KAYIT */
            if (command === "k") {
                const id =
                    findMentionId(args[0]);

                const target =
                    id
                        ? await message.guild.members
                            .fetch(id)
                            .catch(() => null)
                        : null;

                return startRegistration(
                    message,
                    target,
                    args.slice(1).join(" ")
                );
            }

            if (
                command === "kayıtsızver" ||
                command === "kayitsizver"
            ) {
                return unregisteredCommand(
                    message,
                    args
                );
            }

            /* ANTRENMAN */
            if (
                command === "ant" ||
                command === "antrenman"
            ) {
                return trainingCommand(message);
            }

            /* PENALTI */
            if (
                command === "pen" ||
                command === "penaltı" ||
                command === "penalti"
            ) {
                return penaltyCommand(message);
            }

            /* DEĞER */
            if (command === "dver") {
                return valueCommand(
                    message,
                    args,
                    true
                );
            }

            if (command === "dsil") {
                return valueCommand(
                    message,
                    args,
                    false
                );
            }

            /* BÜTÇE */
            if (command === "bütçe" || command === "butce") {
                return budgetCommand(message);
            }

            if (
                command === "gönder" ||
                command === "gonder"
            ) {
                return budgetGive(
                    message,
                    args
                );
            }

            if (
                command === "bütçeekle" ||
                command === "butceekle"
            ) {
                return budgetAdmin(
                    message,
                    args,
                    true
                );
            }

            if (
                command === "bütçesil" ||
                command === "butcesil"
            ) {
                return budgetAdmin(
                    message,
                    args,
                    false
                );
            }

            /* KAP */
            if (command === "kap") {
                return kapCommand(
                    message,
                    args
                );
            }

            /* KADRO */
            if (command === "kadroekle") {
                return squadAdd(
                    message,
                    args
                );
            }

            if (command === "kadrosil") {
                return squadRemove(
                    message,
                    args
                );
            }

            if (command === "kadro") {
                return squadShow(
                    message,
                    args
                );
            }

            /* MAÇ */
            if (command === "maç" || command === "mac") {
                const parsed =
                    parseTwoTeams(
                        message.guild,
                        args
                    );

                if (!parsed) {
                    return message.reply(
                        "❌ İki takımı da etiketlemelisin.\n" +
                        "Örnek: `.maç @Galatasaray @Fenerbahçe`"
                    );
                }

                if (
                    !isOwner(message.member) &&
                    !hasRole(
                        message.member,
                        ROLE_IDS.spiker
                    )
                ) {
                    return message.reply(
                        "❌ Maç başlatmak için Spiker yetkisi gerekir."
                    );
                }

                return startMatch(
                    message,
                    parsed.team1,
                    parsed.team2
                );
            }

            /* FİKSTÜR */
            if (
                command === "fiksturekle" ||
                command === "fikstür-ekle"
            ) {
                return fixtureAdd(
                    message,
                    args
                );
            }

            /* PUAN */
            if (
                command === "puan" ||
                command === "puanlama"
            ) {
                return standingsCommand(
                    message
                );
            }

            /* ARAMA */
            if (command === "ara") {
                return searchPlayers(
                    message,
                    args.join(" ")
                );
            }

            /* DM */
            if (command === "dm") {
                return dmCommand(
                    message,
                    args
                );
            }

            /* SİL */
            if (command === "sil") {
                return deleteMessages(
                    message,
                    args
                );
            }

            /* KİLİT */
            if (command === "kilit") {
                return lockChannel(
                    message,
                    false
                );
            }

            if (
                command === "aç" ||
                command === "ac"
            ) {
                return lockChannel(
                    message,
                    true
                );
            }

            /* EMBED */
            if (command === "embed") {
                return embedCommand(
                    message,
                    args
                );
            }

            /* ROL */
            if (
                command === "rolver" ||
                command === "rol"
            ) {
                return roleGive(
                    message,
                    args
                );
            }

            /* KUPA */
            if (command === "kupaekle") {
                return trophyAdd(
                    message,
                    args
                );
            }

            if (command === "kupasil") {
                return trophyRemove(
                    message,
                    args
                );
            }

            /* ASİST */
            if (
                command === "asistkral" ||
                command === "asistkrali"
            ) {
                return assistKing(
                    message
                );
            }

            /* YARDIM */
            if (
                command === "yardım" ||
                command === "yardim" ||
                command === "help"
            ) {
                return helpCommand(
                    message
                );
            }
        } catch (error) {
            console.error(
                "COMMAND ERROR:",
                error
            );

            if (
                message.channel &&
                message.channel.isTextBased()
            ) {
                message.reply(
                    "❌ Komut çalıştırılırken bir hata oluştu."
                ).catch(() => {});
            }
        }
    }
);

/* =========================================================
   BUTON EVENT
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

            const id =
                interaction.customId;

            /* KAYIT */

            if (
                id.startsWith(
                    "register_"
                )
            ) {
                const parts =
                    id.split("_");

                const type =
                    parts[1];

                const userId =
                    parts[2];

                return completeRegistration(
                    interaction,
                    type,
                    userId
                );
            }

            /* KAP */

            if (
                id.startsWith(
                    "kap_"
                )
            ) {
                return handleKapButton(
                    interaction
                );
            }
        } catch (error) {
            console.error(
                "INTERACTION ERROR:",
                error
            );

            if (!interaction.replied) {
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
   READY
========================================================= */

client.once(
    "ready",
    async () => {
        console.log(
            `✅ ${client.user.tag} aktif!`
        );

        console.log(
            `🏟️ Sunucu sayısı: ${client.guilds.cache.size}`
        );

        await checkFixtures();

        /*
          İlk durum mesajı
        */
        await sendStatus();

        /*
          Her 30 dakikada bir
        */
        setInterval(
            sendStatus,
            30 * 60 * 1000
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

if (!process.env.TOKEN) {
    console.error(
        "❌ TOKEN ortam değişkeni bulunamadı!"
    );
    process.exit(1);
}

client.login(
    process.env.TOKEN
);
