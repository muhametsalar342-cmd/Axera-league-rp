// ================================================================
// AXERA LEAGUE BOT
// Discord.js v14
// Tek dosya: index.js
// ================================================================

const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ================================================================
// AYARLAR
// ================================================================

const PREFIX = ".";

const ROLES = {
    YONETICI: "1544449436011339806",
    KAYIT_YETKILISI: "1544452022764568656",
    DEGER_YETKILISI: "1544451743746891806",
    MODERATOR: "1544450307088715917",
    TEKNIK_DIREKTOR: "1544452323450032229",
    OYUNCU: "1544452779156709516"
};

const CHANNELS = {
    DUYURU: "1544653653330108477"
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction
    ]
});

// ================================================================
// VERİTABANI
// ================================================================

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB = {
    players: path.join(DATA_DIR, "players.json"),
    teams: path.join(DATA_DIR, "teams.json"),
    matches: path.join(DATA_DIR, "matches.json"),
    trophies: path.join(DATA_DIR, "trophies.json"),
    giveaways: path.join(DATA_DIR, "giveaways.json"),
    tickets: path.join(DATA_DIR, "tickets.json"),
    sponsors: path.join(DATA_DIR, "sponsors.json"),
    settings: path.join(DATA_DIR, "settings.json")
};

function ensure(file, data) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }
}

ensure(DB.players, {});
ensure(DB.teams, {});
ensure(DB.matches, []);
ensure(DB.trophies, []);
ensure(DB.giveaways, []);
ensure(DB.tickets, {});
ensure(DB.sponsors, {});
ensure(DB.settings, {
    language: "tr",
    prefix: "."
});

function read(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let players = read(DB.players, {});
let teams = read(DB.teams, {});
let matches = read(DB.matches, []);
let trophies = read(DB.trophies, []);
let giveaways = read(DB.giveaways, []);
let tickets = read(DB.tickets, {});
let sponsors = read(DB.sponsors, {});
let settings = read(DB.settings, { language: "tr", prefix: "." });

// ================================================================
// YARDIMCI
// ================================================================

function saveAll() {
    write(DB.players, players);
    write(DB.teams, teams);
    write(DB.matches, matches);
    write(DB.trophies, trophies);
    write(DB.giveaways, giveaways);
    write(DB.tickets, tickets);
    write(DB.sponsors, sponsors);
    write(DB.settings, settings);
}

function money(value) {
    value = Number(value) || 0;

    if (value >= 1000000000) {
        return `${(value / 1000000000).toFixed(2)}B€`;
    }

    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(2)}M€`;
    }

    if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}K€`;
    }

    return `${value}€`;
}

function parseMoney(value) {
    if (!value) return NaN;

    let text = String(value)
        .toLowerCase()
        .replace(/€/g, "")
        .replace(/\s/g, "")
        .replace(/,/g, ".");

    let multiplier = 1;

    if (text.endsWith("m")) {
        multiplier = 1000000;
        text = text.slice(0, -1);
    } else if (text.endsWith("b")) {
        multiplier = 1000000000;
        text = text.slice(0, -1);
    } else if (text.endsWith("k")) {
        multiplier = 1000;
        text = text.slice(0, -1);
    }

    const n = Number(text);

    if (isNaN(n)) return NaN;

    return Math.round(n * multiplier);
}

function isAdmin(member) {
    return (
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.roles.cache.has(ROLES.YONETICI)
    );
}

function isModerator(member) {
    return (
        isAdmin(member) ||
        member.roles.cache.has(ROLES.MODERATOR)
    );
}

function isValueStaff(member) {
    return (
        isAdmin(member) ||
        member.roles.cache.has(ROLES.DEGER_YETKILISI)
    );
}

function isRegistrationStaff(member) {
    return (
        isAdmin(member) ||
        member.roles.cache.has(ROLES.KAYIT_YETKILISI)
    );
}

function isTechnicalDirector(member) {
    return (
        isAdmin(member) ||
        member.roles.cache.has(ROLES.TEKNIK_DIREKTOR)
    );
}

function getPlayer(id) {
    return players[id];
}

function createPlayer(id, name = "Oyuncu") {
    if (!players[id]) {
        players[id] = {
            id,
            name,
            value: 0,
            budget: 0,
            team: null,
            position: "SNT",
            nationality: "🇹🇷",
            ovr: 75,
            pot: 85,
            goals: 0,
            assists: 0,
            appearances: 0,
            penalties: 0,
            trainings: 0,
            registered: true,
            createdAt: Date.now()
        };

        saveAll();
    }

    return players[id];
}

function getTeam(name) {
    const key = Object.keys(teams).find(
        x => x.toLowerCase() === String(name).toLowerCase()
    );

    return key ? teams[key] : null;
}

function teamNameFromPlayer(player) {
    if (!player || !player.team) return "Yok";
    return player.team;
}

function findMember(guild, id) {
    return guild.members.cache.get(id);
}

function mention(id) {
    return `<@${id}>`;
}

function embed(title, description) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x2b2d31)
        .setTimestamp();
}

async function safeReply(message, content) {
    try {
        return await message.reply(content);
    } catch {
        return null;
    }
}

// ================================================================
// OYUNCU ADI
// ================================================================

async function changePlayerNickname(member, newName) {
    if (!member) return false;

    try {
        const clean = newName
            .replace(/<@!?\d+>/g, "")
            .trim()
            .slice(0, 32);

        if (!clean) return false;

        await member.setNickname(clean);

        return true;
    } catch (err) {
        console.log("Nickname hatası:", err.message);
        return false;
    }
}

// ================================================================
// READY
// ================================================================

client.once("ready", () => {
    console.log("======================================");
    console.log("AXERA LEAGUE BOT AKTİF");
    console.log(`Bot: ${client.user.tag}`);
    console.log(`Sunucu: ${client.guilds.cache.size}`);
    console.log("======================================");

    client.user.setPresence({
        activities: [
            {
                name: "Axera League ⚽",
                type: 3
            }
        ],
        status: "online"
    });
});

// ================================================================
// MESSAGE
// ================================================================

client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const prefix = settings.prefix || PREFIX;

    if (!message.content.startsWith(prefix)) return;

    const args = message.content
        .slice(prefix.length)
        .trim()
        .split(/\s+/);

    const command = args.shift()?.toLowerCase();

    if (!command) return;

    // ============================================================
    // YARDIM
    // ============================================================

    if (command === "yardım" || command === "yardim") {
        const e = new EmbedBuilder()
            .setTitle("⚽ AXERA LEAGUE | KOMUTLAR")
            .setDescription(
                [
                    "**👤 OYUNCU**",
                    "`.k @oyuncu İsim`",
                    "`.oyuncu @oyuncu`",
                    "`.kadro Takım`",
                    "`.ara futbolcu İsim`",
                    "",
                    "**💰 DEĞER / BÜTÇE**",
                    "`.dver @oyuncu 5m`",
                    "`.dsil @oyuncu 2m`",
                    "`.bütçe`",
                    "`.takımbütçe Takım`",
                    "`.takımbütçegönder Takım 5m`",
                    "",
                    "**⚽ FUTBOL**",
                    "`.antrenman`",
                    "`.penaltı`",
                    "`.maç`",
                    "`.fisktür`",
                    "`.asistkral`",
                    "",
                    "**🏆 KUPA**",
                    "`.kupaekle İsim`",
                    "`.kupasil İsim`",
                    "`.kupalar`",
                    "",
                    "**🏦 TAKIM**",
                    "`.takımkur Takım`",
                    "`.takımsil Takım`",
                    "`.oyuncual @oyuncu Takım`",
                    "`.transfer @oyuncu Takım`",
                    "",
                    "**🎁 ÇEKİLİŞ**",
                    "`.çekiliş 10m 2`",
                    "`.çekilişbitir`",
                    "",
                    "**🛠 YETKİLİ**",
                    "`.sil 10`",
                    "`.kilit`",
                    "`.aç`",
                    "`.rolver @oyuncu`",
                    "`.rolal @oyuncu`",
                    "",
                    "**🎫 DİĞER**",
                    "`.ticketpanel`",
                    "`.rolpanel`",
                    "`.dm @oyuncu Mesaj`",
                    "`.dmall Mesaj`",
                    "`.embed Başlık | Açıklama`",
                    "`.sponsor Ekle İsim 10m`"
                ].join("\n")
            )
            .setColor(0x5865f2)
            .setFooter({ text: "Axera League" });

        return message.reply({ embeds: [e] });
    }

    // ============================================================
    // KAYIT
    // .k @oyuncu Takmadı
    // ============================================================

    if (command === "k") {
        if (!isRegistrationStaff(message.member)) {
            return safeReply(message, "❌ Bu komut için yetkin yok.");
        }

        const target = message.mentions.members.first();

        if (!target) {
            return safeReply(
                message,
                "❌ Kullanım: `.k @oyuncu TakmaAd`"
            );
        }

        const newName = args
            .filter(x => !x.match(/^<@!?\d+>$/))
            .join(" ")
            .trim();

        if (!newName) {
            return safeReply(
                message,
                "❌ Oyuncunun yeni adını yazmalısın."
            );
        }

        const player = createPlayer(
            target.id,
            target.user.username
        );

        player.name = newName;

        const success = await changePlayerNickname(
            target,
            newName
        );

        if (!success) {
            return safeReply(
                message,
                "❌ Oyuncunun adı değiştirilemedi. Botun rolünün oyuncudan yüksek olduğundan emin ol."
            );
        }

        try {
            await target.roles.add(ROLES.OYUNCU);
        } catch {}

        saveAll();

        return message.reply({
            embeds: [
                embed(
                    "✅ KAYIT TAMAMLANDI",
                    `${target} artık **${newName}** olarak kayıtlı.\n\n` +
                    `👤 Oyuncu: ${target}\n` +
                    `🏷️ İsim: **${newName}**\n` +
                    `⚽ Rol: <@&${ROLES.OYUNCU}>`
                )
            ]
        });
    }

    // ============================================================
    // OYUNCU PROFİLİ
    // ============================================================

    if (
        command === "oyuncu" ||
        command === "profil"
    ) {
        const target =
            message.mentions.users.first() ||
            message.author;

        const p = getPlayer(target.id);

        if (!p) {
            return safeReply(
                message,
                "❌ Bu oyuncu kayıtlı değil."
            );
        }

        const e = new EmbedBuilder()
            .setTitle(`⚽ ${p.name}`)
            .setDescription(
                [
                    `🇹🇷 Milliyet: ${p.nationality}`,
                    `📍 Pozisyon: **${p.position}**`,
                    `⭐ OVR: **${p.ovr}**`,
                    `📈 POT: **${p.pot}**`,
                    `💰 Değer: **${money(p.value)}**`,
                    `💵 Bütçe: **${money(p.budget)}**`,
                    `🏟️ Takım: **${teamNameFromPlayer(p)}**`,
                    `⚽ Gol: **${p.goals}**`,
                    `🎯 Asist: **${p.assists}**`,
                    `👕 Maç: **${p.appearances}**`,
                    `🏃 Antrenman: **${p.trainings}**`,
                    `🥅 Penaltı: **${p.penalties}**`
                ].join("\n")
            )
            .setColor(0x00aaff)
            .setThumbnail(target.displayAvatarURL());

        return message.reply({ embeds: [e] });
    }

    // ============================================================
    // DEĞER VER
    // .dver @oyuncu 5m
    // ============================================================

    if (command === "dver") {
        if (!isValueStaff(message.member)) {
            return safeReply(message, "❌ Bu komut için yetkin yok.");
        }

        const target = message.mentions.users.first();

        if (!target) {
            return safeReply(
                message,
                "❌ Kullanım: `.dver @oyuncu 5m`"
            );
        }

        const amount = parseMoney(
            args.find(x => !x.startsWith("<@"))
        );

        if (!amount || amount <= 0) {
            return safeReply(message, "❌ Geçerli bir miktar yaz.");
        }

        const p = createPlayer(target.id, target.username);

        const oldValue = p.value;

        p.value += amount;

        saveAll();

        return message.reply({
            embeds: [
                embed(
                    "💰 DEĞER GÜNCELLENDİ",
                    `${target} oyuncusuna **${money(amount)}** eklendi.\n\n` +
                    `Önceki değer: **${money(oldValue)}**\n` +
                    `Yeni değer: **${money(p.value)}**`
                )
            ]
        });
    }

    // ============================================================
    // DEĞER SİL
    // ============================================================

    if (command === "dsil") {
        if (!isValueStaff(message.member)) {
            return safeReply(message, "❌ Bu komut için yetkin yok.");
        }

        const target = message.mentions.users.first();

        if (!target) {
            return safeReply(
                message,
                "❌ Kullanım: `.dsil @oyuncu 5m`"
            );
        }

        const amount = parseMoney(
            args.find(x => !x.startsWith("<@"))
        );

        if (!amount || amount <= 0) {
            return safeReply(message, "❌ Geçerli miktar yaz.");
        }

        const p = createPlayer(target.id, target.username);

        const oldValue = p.value;

        p.value = Math.max(
            0,
            p.value - amount
        );

        saveAll();

        return message.reply({
            embeds: [
                embed(
                    "📉 DEĞER AZALTILDI",
                    `${target} oyuncusundan **${money(amount)}** çıkarıldı.\n\n` +
                    `Önceki değer: **${money(oldValue)}**\n` +
                    `Yeni değer: **${money(p.value)}**`
                )
            ]
        });
    }

    // ============================================================
    // ANTRENMAN
    // ============================================================

    if (
        command === "antrenman" ||
        command === "ant"
    ) {
        const p = createPlayer(
            message.author.id,
            message.member.displayName
        );

        const cooldown = 60 * 60 * 1000;

        if (
            p.lastTraining &&
            Date.now() - p.lastTraining < cooldown
        ) {
            const remaining =
                cooldown -
                (Date.now() - p.lastTraining);

            const minutes =
                Math.ceil(remaining / 60000);

            return safeReply(
                message,
                `⏳ Antrenman için **${minutes} dakika** beklemelisin.`
            );
        }

        p.lastTraining = Date.now();
        p.trainings++;
        p.value += 3000000;
        p.ovr = Math.min(99, p.ovr + 1);

        saveAll();

        return message.reply({
            embeds: [
                embed(
                    "🏃 ANTRENMAN TAMAMLANDI",
                    `Antrenman başarıyla tamamlandı!\n\n` +
                    `💰 Değer: **+3M€**\n` +
                    `⭐ OVR: **+1**\n` +
                    `💎 Yeni değer: **${money(p.value)}**`
                )
            ]
        });
    }

    // ============================================================
    // PENALTI
    // ============================================================

    if (
        command === "penaltı" ||
        command === "pen"
    ) {
        const p = createPlayer(
            message.author.id,
            message.member.displayName
        );

        const cooldown = 30 * 60 * 1000;

        if (
            p.lastPenalty &&
            Date.now() - p.lastPenalty < cooldown
        ) {
            const remaining =
                cooldown -
                (Date.now() - p.lastPenalty);

            return safeReply(
                message,
                `⏳ Penaltı için **${Math.ceil(
                    remaining / 60000
                )} dakika** beklemelisin.`
            );
        }

        p.lastPenalty = Date.now();
        p.penalties++;
        p.value += 2000000;

        const scored = Math.random() < 0.75;

        if (scored) {
            p.goals++;
            p.ovr = Math.min(99, p.ovr + 1);
        }

        saveAll();

        return message.reply({
            embeds: [
                embed(
                    scored
                        ? "🥅 GOL!"
                        : "🧤 KALECİ KURTARDI!",
                    scored
                        ? `Penaltı gol oldu!\n\n💰 Değer: **+2M€**\n⚽ Gol: **+1**`
                        : `Penaltı kaçtı!\n\n💰 Değer: **+2M€**`
                )
            ]
        });
    }

    // ============================================================
    // BÜTÇE
    // ============================================================

    if (
        command === "bütçe" ||
        command === "butce"
    ) {
        const p = createPlayer(
            message.author.id,
            message.member.displayName
        );

        return message.reply(
            `💰 **${p.name}** kişisel bütçen: **${money(
                p.budget
            )}**`
        );
    }

    // ============================================================
    // TAKIM KUR
    // ============================================================

    if (command === "takımkur") {
        if (!isTechnicalDirector(message.member)) {
            return safeReply(message, "❌ Teknik direktör yetkisi gerekli.");
        }

        const name = args.join(" ").trim();

        if (!name) {
            return safeReply(
                message,
                "❌ Kullanım: `.takımkur Takım Adı`"
            );
        }

        if (getTeam(name)) {
            return safeReply(
                message,
                "❌ Bu takım zaten var."
            );
        }

        const key = name.slice(0, 50);

        teams[key] = {
            name: key,
            owner: message.author.id,
            budget: 100000000,
            players: [],
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            createdAt: Date.now()
        };

        saveAll();

        return message.reply(
            `✅ **${key}** takımı oluşturuldu.\n💰 Başlangıç bütçesi: **100M€**`
        );
    }

    // ============================================================
    // TAKIM SİL
    // ============================================================

    if (command === "takımsil") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const name = args.join(" ");
        const team = getTeam(name);

        if (!team) {
            return safeReply(message, "❌ Takım bulunamadı.");
        }

        delete teams[team.name];

        for (const id of team.players || []) {
            if (players[id]) {
                players[id].team = null;
            }
        }

        saveAll();

        return message.reply(
            `🗑️ **${team.name}** takımı silindi.`
        );
    }

    // ============================================================
    // TAKIM BÜTÇE
    // ============================================================

    if (
        command === "takımbütçe" ||
        command === "takimbutce"
    ) {
        const name = args.join(" ");
        const team = getTeam(name);

        if (!team) {
            return safeReply(message, "❌ Takım bulunamadı.");
        }

        return message.reply(
            `🏦 **${team.name}** takım bütçesi: **${money(
                team.budget
            )}**`
        );
    }

    // ============================================================
    // TAKIM BÜTÇE GÖNDER
    // ============================================================

    if (
        command === "takımbütçegönder" ||
        command === "takimbutcegonder"
    ) {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const amount = parseMoney(args[args.length - 1]);

        if (!amount || amount <= 0) {
            return safeReply(message, "❌ Geçerli miktar yaz.");
        }

        const name = args.slice(0, -1).join(" ");
        const team = getTeam(name);

        if (!team) {
            return safeReply(message, "❌ Takım bulunamadı.");
        }

        team.budget += amount;

        saveAll();

        return message.reply(
            `💰 **${team.name}** takımına **${money(
                amount
            )}** gönderildi.\nYeni bütçe: **${money(team.budget)}**`
        );
    }

    // ============================================================
    // OYUNCU AL
    // .oyuncual @oyuncu Takım
    // ============================================================

    if (
        command === "oyuncual" ||
        command === "transfer"
    ) {
        if (!isTechnicalDirector(message.member)) {
            return safeReply(message, "❌ Teknik direktör yetkisi gerekli.");
        }

        const target = message.mentions.users.first();

        if (!target) {
            return safeReply(
                message,
                "❌ Kullanım: `.oyuncual @oyuncu Takım`"
            );
        }

        const teamName = args
            .filter(x => !x.startsWith("<@"))
            .join(" ");

        const team = getTeam(teamName);

        if (!team) {
            return safeReply(message, "❌ Takım bulunamadı.");
        }

        const p = createPlayer(
            target.id,
            target.username
        );

        if (p.team) {
            const old = getTeam(p.team);

            if (old) {
                old.players =
                    old.players.filter(
                        id => id !== target.id
                    );
            }
        }

        p.team = team.name;

        if (!team.players.includes(target.id)) {
            team.players.push(target.id);
        }

        saveAll();

        return message.reply(
            `✅ ${target} **${team.name}** takımına transfer edildi.`
        );
    }

    // ============================================================
    // KADRO
    // ============================================================

    if (command === "kadro") {
        const name = args.join(" ");
        const team = getTeam(name);

        if (!team) {
            return safeReply(message, "❌ Takım bulunamadı.");
        }

        let list = "";

        if (!team.players.length) {
            list = "Kadrosunda oyuncu bulunmuyor.";
        } else {
            list = team.players
                .map((id, i) => {
                    const p = players[id];

                    return `${i + 1}. ${mention(id)} — ${
                        p?.name || "Oyuncu"
                    } | ${money(p?.value || 0)}`;
                })
                .join("\n");
        }

        return message.reply({
            embeds: [
                embed(
                    `⚽ ${team.name} | KADRO`,
                    list
                )
            ]
        });
    }

    // ============================================================
    // FİKSTÜR
    // ============================================================

    if (
        command === "fisktür" ||
        command === "fikstur"
    ) {
        if (!matches.length) {
            return safeReply(
                message,
                "📅 Henüz fikstür oluşturulmamış."
            );
        }

        const list = matches
            .slice(0, 30)
            .map((m, i) =>
                `**${i + 1}.** ${m.home} 🆚 ${m.away}` +
                (m.played
                    ? ` → **${m.homeScore}-${m.awayScore}**`
                    : " → ⏳")
            )
            .join("\n");

        return message.reply({
            embeds: [
                embed(
                    "📅 AXERA LEAGUE | FİKSTÜR",
                    list
                )
            ]
        });
    }

    // ============================================================
    // MAÇ
    // .maç Takım1 Takım2 2 1
    // ============================================================

    if (command === "maç") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        if (args.length < 4) {
            return safeReply(
                message,
                "❌ Kullanım: `.maç Takım1 Takım2 2 1`"
            );
        }

        const homeScore = Number(args[args.length - 2]);
        const awayScore = Number(args[args.length - 1]);

        if (
            isNaN(homeScore) ||
            isNaN(awayScore)
        ) {
            return safeReply(message, "❌ Skor hatalı.");
        }

        const names = args.slice(0, -2);

        if (names.length < 2) {
            return safeReply(message, "❌ İki takım yaz.");
        }

        const half = Math.ceil(names.length / 2);

        const homeName = names
            .slice(0, half)
            .join(" ");

        const awayName = names
            .slice(half)
            .join(" ");

        const home = getTeam(homeName);
        const away = getTeam(awayName);

        if (!home || !away) {
            return safeReply(
                message,
                "❌ Takımlardan biri bulunamadı."
            );
        }

        home.goalsFor += homeScore;
        home.goalsAgainst += awayScore;

        away.goalsFor += awayScore;
        away.goalsAgainst += homeScore;

        if (homeScore > awayScore) {
            home.wins++;
            away.losses++;
            home.points += 3;
        } else if (homeScore < awayScore) {
            away.wins++;
            home.losses++;
            away.points += 3;
        } else {
            home.draws++;
            away.draws++;
            home.points++;
            away.points++;
        }

        matches.push({
            home: home.name,
            away: away.name,
            homeScore,
            awayScore,
            played: true,
            date: Date.now()
        });

        saveAll();

        return message.reply({
            embeds: [
                embed(
                    "🏟️ MAÇ SONUCU",
                    `**${home.name}** ${homeScore} - ${awayScore} **${away.name}**`
                )
            ]
        });
    }

    // ============================================================
    // PUAN DURUMU
    // ============================================================

    if (
        command === "puan" ||
        command === "puanlama" ||
        command === "lig"
    ) {
        const table = Object.values(teams)
            .sort((a, b) =>
                b.points - a.points ||
                (b.goalsFor - b.goalsAgainst) -
                (a.goalsFor - a.goalsAgainst)
            );

        if (!table.length) {
            return safeReply(
                message,
                "❌ Henüz takım yok."
            );
        }

        const list = table
            .map((t, i) =>
                `**${i + 1}. ${t.name}** — ` +
                `${t.points} P | ` +
                `${t.wins}G ${t.draws}B ${t.losses}M | ` +
                `${t.goalsFor}:${t.goalsAgainst}`
            )
            .join("\n");

        return message.reply({
            embeds: [
                embed(
                    "🏆 AXERA LEAGUE | PUAN DURUMU",
                    list
                )
            ]
        });
    }

    // ============================================================
    // ASİST KRALI
    // ============================================================

    if (
        command === "asistkral" ||
        command === "asist"
    ) {
        const list = Object.values(players)
            .sort((a, b) =>
                b.assists - a.assists
            )
            .slice(0, 10)
            .map((p, i) =>
                `**${i + 1}.** ${p.name} — ${p.assists} asist`
            )
            .join("\n");

        return message.reply({
            embeds: [
                embed(
                    "🎯 ASİST KRALLIĞI",
                    list || "Veri yok."
                )
            ]
        });
    }

    // ============================================================
    // GOL KRALI
    // ============================================================

    if (
        command === "golkral" ||
        command === "gol"
    ) {
        const list = Object.values(players)
            .sort((a, b) =>
                b.goals - a.goals
            )
            .slice(0, 10)
            .map((p, i) =>
                `**${i + 1}.** ${p.name} — ${p.goals} gol`
            )
            .join("\n");

        return message.reply({
            embeds: [
                embed(
                    "⚽ GOL KRALLIĞI",
                    list || "Veri yok."
                )
            ]
        });
    }

    // ============================================================
    // KUPA EKLE
    // ============================================================

    if (command === "kupaekle") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const name = args.join(" ");

        if (!name) {
            return safeReply(message, "❌ Kupa adı yaz.");
        }

        trophies.push({
            name,
            createdAt: Date.now()
        });

        saveAll();

        return message.reply(
            `🏆 **${name}** kupası eklendi.`
        );
    }

    // ============================================================
    // KUPA SİL
    // ============================================================

    if (command === "kupasil") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const name = args.join(" ");

        const before = trophies.length;

        trophies = trophies.filter(
            x =>
                x.name.toLowerCase() !==
                name.toLowerCase()
        );

        saveAll();

        return message.reply(
            before !== trophies.length
                ? `🗑️ **${name}** kupası silindi.`
                : "❌ Kupa bulunamadı."
        );
    }

    // ============================================================
    // KUPALAR
    // ============================================================

    if (command === "kupalar") {
        const list = trophies.length
            ? trophies
                .map((x, i) =>
                    `🏆 **${i + 1}.** ${x.name}`
                )
                .join("\n")
            : "Henüz kupa bulunmuyor.";

        return message.reply({
            embeds: [
                embed(
                    "🏆 AXERA LEAGUE | KUPALAR",
                    list
                )
            ]
        });
    }

    // ============================================================
    // ÇEKİLİŞ
    // ============================================================

    if (command === "çekiliş" || command === "cekilis") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const amount = parseMoney(args[0]);
        const count = Number(args[1]) || 1;

        if (!amount || amount <= 0) {
            return safeReply(
                message,
                "❌ Kullanım: `.çekiliş 10m 2`"
            );
        }

        const giveaway = {
            id: Date.now().toString(),
            amount,
            count,
            channel: message.channel.id,
            message: null,
            participants: [],
            active: true,
            createdAt: Date.now()
        };

        const sent = await message.channel.send({
            embeds: [
                embed(
                    "🎁 ÇEKİLİŞ",
                    `Ödül: **${money(amount)}**\n` +
                    `Kazanan: **${count} kişi**\n\n` +
                    `🎉 Katılmak için aşağıdaki butona bas!`
                )
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `giveaway_join_${giveaway.id}`
                        )
                        .setLabel("Katıl")
                        .setEmoji("🎉")
                        .setStyle(ButtonStyle.Primary)
                )
            ]
        });

        giveaway.message = sent.id;

        giveaways.push(giveaway);

        saveAll();

        return;
    }

    // ============================================================
    // ÇEKİLİŞ BİTİR
    // ============================================================

    if (
        command === "çekilişbitir" ||
        command === "cekilisbitir"
    ) {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const active = giveaways.find(
            x => x.active
        );

        if (!active) {
            return safeReply(
                message,
                "❌ Aktif çekiliş yok."
            );
        }

        active.active = false;

        const participants =
            active.participants || [];

        if (!participants.length) {
            saveAll();

            return message.reply(
                "❌ Çekilişe kimse katılmadı."
            );
        }

        const shuffled = [...participants]
            .sort(() => Math.random() - 0.5);

        const winners = shuffled.slice(
            0,
            Math.min(
                active.count,
                shuffled.length
            )
        );

        for (const id of winners) {
            const p = createPlayer(
                id,
                client.users.cache.get(id)?.username ||
                "Oyuncu"
            );

            p.budget += active.amount;
        }

        saveAll();

        return message.reply({
            embeds: [
                embed(
                    "🎉 ÇEKİLİŞ SONUÇLANDI",
                    winners
                        .map(
                            (id, i) =>
                                `${i + 1}. ${mention(id)} — **${money(
                                    active.amount
                                )}**`
                        )
                        .join("\n")
                )
            ]
        });
    }

    // ============================================================
    // DM
    // ============================================================

    if (command === "dm") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const target = message.mentions.users.first();

        if (!target) {
            return safeReply(
                message,
                "❌ Kullanım: `.dm @oyuncu mesaj`"
            );
        }

        const text = args
            .filter(x => !x.startsWith("<@"))
            .join(" ");

        if (!text) {
            return safeReply(message, "❌ Mesaj yaz.");
        }

        try {
            await target.send(text);

            return message.reply(
                `✅ ${target} kişisine DM gönderildi.`
            );
        } catch {
            return message.reply(
                "❌ Kullanıcının DM'si kapalı."
            );
        }
    }

    // ============================================================
    // DM ALL
    // ============================================================

    if (
        command === "dmall" ||
        command === "dm-all"
    ) {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const text = args.join(" ");

        if (!text) {
            return safeReply(message, "❌ Mesaj yaz.");
        }

        let sent = 0;

        for (const member of message.guild.members.cache.values()) {
            if (member.user.bot) continue;

            try {
                await member.send(text);
                sent++;
            } catch {}
        }

        return message.reply(
            `📨 DM gönderimi tamamlandı. Başarılı: **${sent}**`
        );
    }

    // ============================================================
    // EMBED
    // ============================================================

    if (command === "embed") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const raw = args.join(" ");
        const parts = raw.split("|");

        const title =
            parts[0]?.trim() ||
            "Axera League";

        const description =
            parts.slice(1).join("|").trim() ||
            "Axera League";

        return message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(0x5865f2)
                    .setTimestamp()
            ]
        });
    }

    // ============================================================
    // SİL
    // ============================================================

    if (command === "sil") {
        if (!isModerator(message.member)) {
            return safeReply(message, "❌ Moderatör yetkisi gerekli.");
        }

        const amount = Number(args[0]);

        if (
            !amount ||
            amount < 1 ||
            amount > 100
        ) {
            return safeReply(
                message,
                "❌ 1-100 arasında miktar yaz."
            );
        }

        try {
            await message.channel.bulkDelete(
                amount,
                true
            );

            const msg = await message.channel.send(
                `🗑️ **${amount}** mesaj silindi.`
            );

            setTimeout(() => {
                msg.delete().catch(() => {});
            }, 3000);
        } catch {
            return safeReply(
                message,
                "❌ Mesajlar silinemedi."
            );
        }

        return;
    }

    // ============================================================
    // KİLİT
    // ============================================================

    if (command === "kilit") {
        if (!isModerator(message.member)) {
            return safeReply(message, "❌ Moderatör yetkisi gerekli.");
        }

        try {
            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            return message.reply(
                "🔒 Kanal kilitlendi."
            );
        } catch {
            return safeReply(
                message,
                "❌ Kanal kilitlenemedi."
            );
        }
    }

    // ============================================================
    // AÇ
    // ============================================================

    if (
        command === "aç" ||
        command === "ac"
    ) {
        if (!isModerator(message.member)) {
            return safeReply(message, "❌ Moderatör yetkisi gerekli.");
        }

        try {
            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: null
                }
            );

            return message.reply(
                "🔓 Kanal açıldı."
            );
        } catch {
            return safeReply(
                message,
                "❌ Kanal açılamadı."
            );
        }
    }

    // ============================================================
    // ROL VER
    // ============================================================

    if (command === "rolver") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const target = message.mentions.members.first();

        if (!target) {
            return safeReply(
                message,
                "❌ Kullanıcı etiketle."
            );
        }

        const role =
            message.mentions.roles.first();

        if (role) {
            try {
                await target.roles.add(role);
                return message.reply(
                    `✅ ${target} kullanıcısına ${role} verildi.`
                );
            } catch {
                return safeReply(
                    message,
                    "❌ Rol verilemedi."
                );
            }
        }

        try {
            await target.roles.add(
                ROLES.OYUNCU
            );

            return message.reply(
                `✅ ${target} oyuncu rolünü aldı.`
            );
        } catch {
            return safeReply(
                message,
                "❌ Rol verilemedi."
            );
        }
    }

    // ============================================================
    // ROL AL
    // ============================================================

    if (command === "rolal") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const target = message.mentions.members.first();

        if (!target) {
            return safeReply(
                message,
                "❌ Kullanıcı etiketle."
            );
        }

        const role =
            message.mentions.roles.first();

        if (!role) {
            return safeReply(
                message,
                "❌ Alınacak rolü etiketle."
            );
        }

        try {
            await target.roles.remove(role);

            return message.reply(
                `✅ ${target} kullanıcısından ${role} alındı.`
            );
        } catch {
            return safeReply(
                message,
                "❌ Rol alınamadı."
            );
        }
    }

    // ============================================================
    // ROL PANEL
    // ============================================================

    if (command === "rolpanel") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("role_player")
                    .setLabel("Oyuncu")
                    .setEmoji("⚽")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId("role_remove")
                    .setLabel("Rolü Kaldır")
                    .setEmoji("❌")
                    .setStyle(ButtonStyle.Danger)
            );

        return message.channel.send({
            embeds: [
                embed(
                    "🎭 AXERA LEAGUE | ROL PANELİ",
                    "Oyuncu rolünü almak için butona bas."
                )
            ],
            components: [row]
        });
    }

    // ============================================================
    // TICKET PANEL
    // ============================================================

    if (command === "ticketpanel") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("ticket_open")
                    .setLabel("Ticket Aç")
                    .setEmoji("🎫")
                    .setStyle(ButtonStyle.Primary)
            );

        return message.channel.send({
            embeds: [
                embed(
                    "🎫 DESTEK SİSTEMİ",
                    "Destek almak için aşağıdaki butona bas."
                )
            ],
            components: [row]
        });
    }

    // ============================================================
    // SPONSOR
    // ============================================================

    if (command === "sponsor") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const action = args.shift()?.toLowerCase();

        if (action === "ekle") {
            const amount = parseMoney(
                args[args.length - 1]
            );

            const name = args
                .slice(0, -1)
                .join(" ");

            if (!name || !amount) {
                return safeReply(
                    message,
                    "❌ Kullanım: `.sponsor ekle İsim 10m`"
                );
            }

            sponsors[name] = {
                name,
                amount,
                createdAt: Date.now()
            };

            saveAll();

            return message.reply(
                `🤝 Sponsor eklendi: **${name}** — **${money(
                    amount
                )}**`
            );
        }

        if (action === "liste") {
            const list =
                Object.values(sponsors)
                    .map(
                        x =>
                            `🤝 **${x.name}** — ${money(
                                x.amount
                            )}`
                    )
                    .join("\n") ||
                "Sponsor bulunmuyor.";

            return message.reply({
                embeds: [
                    embed(
                        "🤝 SPONSORLAR",
                        list
                    )
                ]
            });
        }
    }

    // ============================================================
    // ARA FUTBOLCU
    // ============================================================

    if (
        command === "ara" &&
        args[0]?.toLowerCase() === "futbolcu"
    ) {
        const search = args
            .slice(1)
            .join(" ")
            .toLowerCase();

        if (!search) {
            return safeReply(
                message,
                "❌ Futbolcu adı yaz."
            );
        }

        const results =
            Object.values(players)
                .filter(
                    p =>
                        p.name
                            .toLowerCase()
                            .includes(search)
                )
                .slice(0, 10);

        if (!results.length) {
            return safeReply(
                message,
                "❌ Oyuncu bulunamadı."
            );
        }

        return message.reply({
            embeds: [
                embed(
                    "🔎 FUTBOLCU ARAMA",
                    results
                        .map(
                            p =>
                                `⚽ **${p.name}** | ${p.position} | ${money(
                                    p.value
                                )}`
                        )
                        .join("\n")
                )
            ]
        });
    }

    // ============================================================
    // DİL
    // ============================================================

    if (command === "dil") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const lang = args[0]?.toLowerCase();

        if (!["tr", "en"].includes(lang)) {
            return safeReply(
                message,
                "❌ Kullanım: `.dil tr` veya `.dil en`"
            );
        }

        settings.language = lang;

        saveAll();

        return message.reply(
            `🌐 Dil **${lang}** olarak ayarlandı.`
        );
    }

    // ============================================================
    // KAP
    // ============================================================

    if (command === "kap") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const channel =
            message.mentions.channels.first() ||
            message.channel;

        try {
            await channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            return message.reply(
                `🔒 ${channel} kapatıldı.`
            );
        } catch {
            return safeReply(
                message,
                "❌ Kanal kapatılamadı."
            );
        }
    }

    // ============================================================
    // EMOJİ KUR
    // ============================================================

    if (command === "emojikur") {
        if (!isAdmin(message.member)) {
            return safeReply(message, "❌ Yönetici yetkisi gerekli.");
        }

        const url = args[0];
        const name = args[1];

        if (!url || !name) {
            return safeReply(
                message,
                "❌ Kullanım: `.emojikur URL isim`"
            );
        }

        try {
            const emoji =
                await message.guild.emojis.create({
                    attachment: url,
                    name: name.replace(/[^a-zA-Z0-9_]/g, "")
                });

            return message.reply(
                `✅ Emoji oluşturuldu: ${emoji}`
            );
        } catch {
            return safeReply(
                message,
                "❌ Emoji oluşturulamadı."
            );
        }
    }

    // ============================================================
    // ÇEKİLİŞ / BUTONLAR
    // ============================================================
});

// ================================================================
// INTERACTIONS
// ================================================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    // ============================================================
    // ROL PANEL
    // ============================================================

    if (interaction.customId === "role_player") {
        try {
            if (
                interaction.member.roles.cache.has(
                    ROLES.OYUNCU
                )
            ) {
                await interaction.reply({
                    content: "ℹ️ Zaten Oyuncu rolün var.",
                    ephemeral: true
                });

                return;
            }

            await interaction.member.roles.add(
                ROLES.OYUNCU
            );

            createPlayer(
                interaction.user.id,
                interaction.member.displayName
            );

            await interaction.reply({
                content: "✅ Oyuncu rolün verildi.",
                ephemeral: true
            });
        } catch {
            await interaction.reply({
                content: "❌ Rol verilemedi.",
                ephemeral: true
            });
        }

        return;
    }

    if (interaction.customId === "role_remove") {
        try {
            await interaction.member.roles.remove(
                ROLES.OYUNCU
            );

            await interaction.reply({
                content: "✅ Oyuncu rolün kaldırıldı.",
                ephemeral: true
            });
        } catch {
            await interaction.reply({
                content: "❌ Rol kaldırılamadı.",
                ephemeral: true
            });
        }

        return;
    }

    // ============================================================
    // ÇEKİLİŞ
    // ============================================================

    if (
        interaction.customId.startsWith(
            "giveaway_join_"
        )
    ) {
        const id =
            interaction.customId.replace(
                "giveaway_join_",
                ""
            );

        const giveaway =
            giveaways.find(
                x => x.id === id
            );

        if (!giveaway || !giveaway.active) {
            return interaction.reply({
                content:
                    "❌ Bu çekiliş artık aktif değil.",
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
                    "ℹ️ Zaten çekilişe katıldın.",
                ephemeral: true
            });
        }

        giveaway.participants.push(
            interaction.user.id
        );

        saveAll();

        return interaction.reply({
            content:
                "🎉 Çekilişe başarıyla katıldın!",
            ephemeral: true
        });
    }

    // ============================================================
    // TICKET
    // ============================================================

    if (interaction.customId === "ticket_open") {
        const guild = interaction.guild;

        const existing =
            guild.channels.cache.find(
                ch =>
                    ch.type === ChannelType.GuildText &&
                    ch.name ===
                        `ticket-${interaction.user.id}`
            );

        if (existing) {
            return interaction.reply({
                content:
                    `❌ Zaten açık ticketın var: ${existing}`,
                ephemeral: true
            });
        }

        try {
            const channel =
                await guild.channels.create({
                    name:
                        `ticket-${interaction.user.id}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone.id,
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
                        {
                            id: ROLES.YONETICI,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ReadMessageHistory
                            ]
                        },
                        {
                            id: ROLES.MODERATOR,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.ReadMessageHistory
                            ]
                        }
                    ]
                });

            tickets[channel.id] = {
                owner: interaction.user.id,
                createdAt: Date.now(),
                lastMessage: Date.now()
            };

            saveAll();

            const row =
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
                    embed(
                        "🎫 DESTEK TICKETI",
                        "Yetkili ekibimiz kısa süre içinde yardımcı olacaktır."
                    )
                ],
                components: [row]
            });

            await interaction.reply({
                content:
                    `✅ Ticket oluşturuldu: ${channel}`,
                ephemeral: true
            });
        } catch {
            await interaction.reply({
                content:
                    "❌ Ticket oluşturulamadı.",
                ephemeral: true
            });
        }

        return;
    }

    if (
        interaction.customId ===
        "ticket_close"
    ) {
        if (!isModerator(interaction.member)) {
            return interaction.reply({
                content:
                    "❌ Bu ticketı kapatmak için yetkin yok.",
                ephemeral: true
            });
        }

        await interaction.reply(
            "🔒 Ticket 5 saniye içinde kapatılıyor."
        );

        setTimeout(() => {
            interaction.channel
                .delete()
                .catch(() => {});
        }, 5000);
    }
});

// ================================================================
// TICKET AKTİVİTE TAKİBİ
// ================================================================

client.on("messageCreate", message => {
    if (!message.guild) return;

    const ticket = tickets[message.channel.id];

    if (!ticket) return;

    ticket.lastMessage = Date.now();

    saveAll();
});

// ================================================================
// OTOMATİK TICKET KAPATMA
// 60 DAKİKA MESAJ YOKSA
// ================================================================

setInterval(() => {
    const now = Date.now();

    for (const [channelId, ticket] of Object.entries(
        tickets
    )) {
        if (
            now - ticket.lastMessage >=
            60 * 60 * 1000
        ) {
            const guildChannel =
                client.channels.cache.get(
                    channelId
                );

            if (guildChannel) {
                guildChannel
                    .delete()
                    .catch(() => {});
            }

            delete tickets[channelId];
        }
    }

    saveAll();
}, 5 * 60 * 1000);

// ================================================================
// HATALAR
// ================================================================

process.on("unhandledRejection", error => {
    console.error(
        "Unhandled Rejection:",
        error
    );
});

process.on("uncaughtException", error => {
    console.error(
        "Uncaught Exception:",
        error
    );
});

// ================================================================
// LOGIN
// ================================================================

if (!process.env.TOKEN) {
    console.error(
        "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
    );
    process.exit(1);
}

client.login(process.env.TOKEN);
