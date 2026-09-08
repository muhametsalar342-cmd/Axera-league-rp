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
  ChannelType
} = require("discord.js");

const Database = require("better-sqlite3");

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

const PREFIX = ".";
const MAX_VALUE = 1_000_000_000;

const ROLE_IDS = {
  FUTBOLCU: "1534457228986421278",
  KALECI: "1534492034243498195",
  KAYITSIZ: "1534457560134844517",
  TD: "1534456648930693120",
  KAYIT: "1534456315366342716",
  DEGER: "1534456192913375382",
  MAC: "1535251168169697390"
};

const CHANNEL_IDS = {
  KAYIT: "1534460177884123276",
  ANTRENMAN: "1534474070798762197",
  PENALTI: "1534474327812997192",
  MAC: "1534477626872168541",
  PUAN: "1534475991404253284",
  DEGER: "1534636658668998716"
};

const db = new Database("axera_league.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  position TEXT DEFAULT 'SNT',
  value INTEGER DEFAULT 0,
  budget INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  shots INTEGER DEFAULT 0,
  matches INTEGER DEFAULT 0,
  yellow INTEGER DEFAULT 0,
  red INTEGER DEFAULT 0,
  mvp INTEGER DEFAULT 0,
  training_progress INTEGER DEFAULT 0,
  training_last INTEGER DEFAULT 0,
  tweet_last INTEGER DEFAULT 0,
  PRIMARY KEY(guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS teams (
  guild_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value INTEGER DEFAULT 0,
  PRIMARY KEY(guild_id,team_id)
);

CREATE TABLE IF NOT EXISTS team_members (
  guild_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  position TEXT DEFAULT 'SNT',
  PRIMARY KEY(guild_id,team_id,user_id)
);

CREATE TABLE IF NOT EXISTS standings (
  guild_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  gf INTEGER DEFAULT 0,
  ga INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  PRIMARY KEY(guild_id,team_id)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  team1 TEXT NOT NULL,
  team2 TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  status TEXT DEFAULT 'BEKLIYOR'
);

CREATE TABLE IF NOT EXISTS cups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

const activeMatches = new Map();
const registrationPanels = new Map();

function money(value) {
  value = Math.max(0, Math.round(Number(value) || 0));
  if (value >= 1_000_000_000) return "1.000M€";
  return `${(value / 1_000_000).toFixed(0)}M€`;
}

function parseMoney(text) {
  if (!text) return NaN;
  let s = String(text).toUpperCase().replace(/€/g, "").replace(/\s/g, "");
  let multiplier = 1;

  if (s.endsWith("B")) {
    multiplier = 1_000_000_000;
    s = s.slice(0, -1);
  } else if (s.endsWith("M")) {
    multiplier = 1_000_000;
    s = s.slice(0, -1);
  } else if (s.endsWith("K")) {
    multiplier = 1_000;
    s = s.slice(0, -1);
  }

  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * multiplier) : NaN;
}

function isAdmin(member) {
  return !!member &&
    (member.permissions.has(PermissionsBitField.Flags.Administrator) ||
     member.roles.cache.has(process.env.ADMIN_ROLE_ID || ""));
}

function hasRole(member, roleId) {
  return isAdmin(member) || member.roles.cache.has(roleId);
}

function allowedChannel(message, channelId) {
  return message.channel.id === channelId;
}

function getPlayer(guildId, userId) {
  return db.prepare(
    "SELECT * FROM players WHERE guild_id=? AND user_id=?"
  ).get(guildId, userId);
}

function ensurePlayer(guildId, userId, name = "") {
  let p = getPlayer(guildId, userId);

  if (!p) {
    db.prepare(`
      INSERT INTO players(guild_id,user_id,name)
      VALUES(?,?,?)
    `).run(guildId, userId, name);

    p = getPlayer(guildId, userId);
  }

  return p;
}

function getTeam(guildId, teamId) {
  return db.prepare(
    "SELECT * FROM teams WHERE guild_id=? AND team_id=?"
  ).get(guildId, teamId);
}

function registered(member) {
  return member.roles.cache.has(ROLE_IDS.FUTBOLCU) ||
         member.roles.cache.has(ROLE_IDS.KALECI) ||
         member.roles.cache.has(ROLE_IDS.TD);
}

function getPosition(member) {
  if (member.roles.cache.has(ROLE_IDS.KALECI)) return "KL";
  if (member.roles.cache.has(ROLE_IDS.TD)) return "TD";
  return "SNT";
}

function logTransaction(guildId, userId, amount, type) {
  db.prepare(`
    INSERT INTO transactions(guild_id,user_id,amount,type,created_at)
    VALUES(?,?,?,?,?)
  `).run(guildId, userId, amount, type, Date.now());
}

async function setValue(guild, user, delta, actorId, reason) {
  const p = ensurePlayer(guild.id, user.id, user.username);

  const oldValue = p.value;
  const newValue = Math.max(
    0,
    Math.min(MAX_VALUE, oldValue + Number(delta))
  );

  db.prepare(`
    UPDATE players SET value=?
    WHERE guild_id=? AND user_id=?
  `).run(newValue, guild.id, user.id);

  logTransaction(
    guild.id,
    user.id,
    newValue - oldValue,
    reason
  );

  const member = await guild.members.fetch(user.id).catch(() => null);

  if (member && guild.members.me?.permissions.has(
    PermissionsBitField.Flags.ManageNicknames
  )) {
    const oldNick = member.nickname || member.user.username;

    let newNick;

    if (/\d+(?:[.,]\d+)?\s*M€\s*$/i.test(oldNick)) {
      newNick = oldNick.replace(
        /\d+(?:[.,]\d+)?\s*M€\s*$/i,
        `${(newValue / 1_000_000).toFixed(0)}M€`
      );
    } else {
      newNick = `${oldNick} | ${money(newValue)}`;
    }

    await member.setNickname(newNick.slice(0, 32)).catch(() => {});
  }

  return {
    oldValue,
    newValue,
    changed: newValue - oldValue
  };
}

function teamPlayers(guildId, teamId) {
  return db.prepare(`
    SELECT p.*, tm.position AS team_position
    FROM team_members tm
    JOIN players p
      ON p.guild_id=tm.guild_id
     AND p.user_id=tm.user_id
    WHERE tm.guild_id=? AND tm.team_id=?
  `).all(guildId, teamId);
}

function teamValue(guildId, teamId) {
  const rows = teamPlayers(guildId, teamId);

  if (!rows.length) {
    const t = getTeam(guildId, teamId);
    return t?.value || 0;
  }

  return rows.reduce((sum, p) => sum + p.value, 0);
}

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mentionPlayer(p) {
  return `<@${p.user_id}>`;
}

function positionLabel(position) {
  const map = {
    KL: "🧤 Kaleci",
    STP: "🛡️ Stoper",
    SĞB: "➡️ Sağ Bek",
    SLB: "⬅️ Sol Bek",
    MO: "🎯 Orta Saha",
    MOO: "✨ Ofansif Orta Saha",
    SĞK: "🏃 Sağ Kanat",
    SLK: "🏃 Sol Kanat",
    SNT: "⚽ Santrafor",
    TD: "📋 Teknik Direktör"
  };

  return map[position] || position;
}

function saveTeamValue(guildId, teamId) {
  db.prepare(`
    UPDATE teams SET value=?
    WHERE guild_id=? AND team_id=?
  `).run(teamValue(guildId, teamId), guildId, teamId);
}

function getStandings(guildId) {
  return db.prepare(`
    SELECT s.*, t.name
    FROM standings s
    JOIN teams t
      ON t.guild_id=s.guild_id
     AND t.team_id=s.team_id
    WHERE s.guild_id=?
    ORDER BY s.points DESC,
             (s.gf-s.ga) DESC,
             s.gf DESC
  `).all(guildId);
}

function addStanding(team, result, gf, ga) {
  const guildId = team.guild_id;

  let win = 0;
  let draw = 0;
  let loss = 0;
  let points = 0;

  if (result === "W") {
    win = 1;
    points = 3;
  }

  if (result === "D") {
    draw = 1;
    points = 1;
  }

  if (result === "L") {
    loss = 1;
  }

  db.prepare(`
    UPDATE standings
    SET played=played+1,
        wins=wins+?,
        draws=draws+?,
        losses=losses+?,
        gf=gf+?,
        ga=ga+?,
        points=points+?
    WHERE guild_id=? AND team_id=?
  `).run(
    1,
    draw,
    loss,
    gf,
    ga,
    points,
    guildId,
    team.team_id
  );
}

function standingsEmbed(guildId) {
  const rows = getStandings(guildId);

  const text = rows.length
    ? rows.map((t, i) => {
        const av = t.gf - t.ga;
        return `**${i + 1}. ${t.name}**\n` +
          `🎮 ${t.played} | 🟢 ${t.wins} | 🟡 ${t.draws} | 🔴 ${t.losses} | ` +
          `⚽ ${t.gf}:${t.ga} | 📊 AV ${av} | 🏆 **${t.points}**`;
      }).join("\n\n")
    : "Henüz takım bulunmuyor.";

  return new EmbedBuilder()
    .setTitle("🏆 AXERA LEAGUE PUAN DURUMU")
    .setDescription(text)
    .setFooter({ text: "Axera League" })
    .setTimestamp();
}

function matchChannel(message) {
  return allowedChannel(message, CHANNEL_IDS.MAC);
}

function makeEventText(event) {
  return `**${event.minute}. Dakika**\n${event.text}`;
}

function chooseAttackPlayer(players) {
  const attackers = players.filter(p =>
    ["SNT", "SĞK", "SLK", "MOO", "MO"].includes(p.team_position)
  );

  return random(attackers.length ? attackers : players);
}

function chooseMidPlayer(players) {
  const mids = players.filter(p =>
    ["MO", "MOO", "SĞK", "SLK"].includes(p.team_position)
  );

  return random(mids.length ? mids : players);
}

function chooseDefender(players) {
  const defs = players.filter(p =>
    ["STP", "SĞB", "SLB", "KL"].includes(p.team_position)
  );

  return random(defs.length ? defs : players);
}

function chooseKeeper(players) {
  const keepers = players.filter(p => p.team_position === "KL");
  return random(keepers.length ? keepers : players);
}

function valueAdvantage(v1, v2) {
  const total = v1 + v2;

  if (total <= 0) return 0;

  const ratio = v1 / total;

  return Math.max(-0.10, Math.min(0.10, (ratio - 0.5) * 0.20));
}

async function startLiveMatch(guild, team1, team2, channel, fixtureId = null) {
  const key = `${guild.id}:${team1.team_id}:${team2.team_id}`;

  if (activeMatches.has(key)) return;

  const t1Players = teamPlayers(guild.id, team1.team_id);
  const t2Players = teamPlayers(guild.id, team2.team_id);

  const p1 = t1Players.length
    ? t1Players
    : [{
        user_id: "0",
        name: team1.name,
        value: 0,
        team_position: "SNT"
      }];

  const p2 = t2Players.length
    ? t2Players
    : [{
        user_id: "0",
        name: team2.name,
        value: 0,
        team_position: "SNT"
      }];

  const v1 = teamValue(guild.id, team1.team_id);
  const v2 = teamValue(guild.id, team2.team_id);

  const state = {
    key,
    fixtureId,
    guild,
    team1,
    team2,
    p1,
    p2,
    v1,
    v2,
    minute: 0,
    score1: 0,
    score2: 0,
    shots1: 0,
    shots2: 0,
    saves1: 0,
    saves2: 0,
    corners1: 0,
    corners2: 0,
    possession1: 50,
    possession2: 50,
    events: [],
    startedAt: Date.now(),
    message: null,
    interval: null
  };

  activeMatches.set(key, state);

  const embed = new EmbedBuilder()
    .setTitle(`🔴 CANLI MAÇ — ${team1.name} 🆚 ${team2.name}`)
    .setDescription(
      `⏱️ **0'**\n\n` +
      `🏟️ Maç başlıyor...\n\n` +
      `**${team1.name} 0 - 0 ${team2.name}**`
    )
    .addFields(
      { name: "🏟️ Saha", value: "100 metre", inline: true },
      { name: "💰 Takım Değeri", value: `${money(v1)} — ${money(v2)}`, inline: true },
      { name: "📊 Topa Sahip Olma", value: "50% — 50%", inline: true }
    )
    .setFooter({ text: "🔴 CANLI • 3 saniye = 1 maç dakikası" })
    .setTimestamp();

  state.message = await channel.send({ embeds: [embed] });

  state.interval = setInterval(async () => {
    if (!activeMatches.has(key)) return;

    state.minute++;

    const team1Adv = valueAdvantage(state.v1, state.v2);

    const attackTeam1 =
      Math.random() < (0.5 + team1Adv)
        ? 1
        : 2;

    const attacking =
      attackTeam1 === 1 ? state.p1 : state.p2;

    const defending =
      attackTeam1 === 1 ? state.p2 : state.p1;

    const attackTeam =
      attackTeam1 === 1 ? state.team1 : state.team2;

    const defendTeam =
      attackTeam1 === 1 ? state.team2 : state.team1;

    const attacker = chooseAttackPlayer(attacking);
    const midfielder = chooseMidPlayer(attacking);
    const defender = chooseDefender(defending);
    const keeper = chooseKeeper(defending);

    let event = null;

    const eventRoll = Math.random();

    if (eventRoll < 0.13) {
      const metre = Math.floor(30 + Math.random() * 65);

      event = {
        minute: state.minute,
        text:
          `🏃 ${mentionPlayer(midfielder)} topu aldı ve **${metre}. metrede** ` +
          `${mentionPlayer(attacker)}'a gönderdi.`
      };
    } else if (eventRoll < 0.23) {
      event = {
        minute: state.minute,
        text:
          `🛡️ ${mentionPlayer(defender)} araya girdi ve ` +
          `atağı kesti.`
      };
    } else if (eventRoll < 0.33) {
      const metre = Math.floor(70 + Math.random() * 25);

      event = {
        minute: state.minute,
        text:
          `⚡ ${mentionPlayer(attacker)} **${metre}. metrede** ` +
          `rakip savunmanın arkasına sarktı!`
      };
    } else if (eventRoll < 0.44) {
      if (attackTeam1 === 1) state.shots1++;
      else state.shots2++;

      event = {
        minute: state.minute,
        text:
          `🎯 ${mentionPlayer(attacker)} ceza sahasına yaklaştı ve ` +
          `şutunu çekti!`
      };

      const goalChance =
        0.055 +
        Math.max(0, Math.min(0.025, team1Adv * (attackTeam1 === 1 ? 1 : -1)));

      if (Math.random() < goalChance) {
        if (attackTeam1 === 1) state.score1++;
        else state.score2++;

        const assistChance = Math.random() < 0.75;
        const assistPlayer = assistChance ? midfielder : null;

        await setValue(
          guild,
          await guild.members.fetch(attacker.user_id).then(m => m.user).catch(() => null) || { id: attacker.user_id, username: attacker.name },
          2_000_000,
          guild.client.user.id,
          "MAC_GOL"
        ).catch(() => {});

        db.prepare(`
          UPDATE players
          SET goals=goals+1, matches=matches+1
          WHERE guild_id=? AND user_id=?
        `).run(guild.id, attacker.user_id);

        if (assistPlayer && assistPlayer.user_id !== attacker.user_id) {
          await setValue(
            guild,
            await guild.members.fetch(assistPlayer.user_id).then(m => m.user).catch(() => null) || { id: assistPlayer.user_id, username: assistPlayer.name },
            1_000_000,
            guild.client.user.id,
            "MAC_ASIST"
          ).catch(() => {});

          db.prepare(`
            UPDATE players
            SET assists=assists+1
            WHERE guild_id=? AND user_id=?
          `).run(guild.id, assistPlayer.user_id);
        }

        event = {
          minute: state.minute,
          text:
            `🔥 **GOOOOOOL!** ⚽\n` +
            `🥅 ${mentionPlayer(attacker)} topu ağlara gönderdi!\n` +
            `${assistPlayer ? `🅰️ Asist: ${mentionPlayer(assistPlayer)}\n` : ""}` +
            `📊 **${state.team1.name} ${state.score1} - ${state.score2} ${state.team2.name}**`
        };
      } else if (Math.random() < 0.35) {
        if (attackTeam1 === 1) state.saves2++;
        else state.saves1++;

        db.prepare(`
          UPDATE players
          SET saves=saves+1
          WHERE guild_id=? AND user_id=?
        `).run(guild.id, keeper.user_id);

        event = {
          minute: state.minute,
          text:
            `🧤 ${mentionPlayer(attacker)} vurdu!\n` +
            `🧤 ${mentionPlayer(keeper)} müthiş bir kurtarış yaptı!`
        };
      } else {
        event = {
          minute: state.minute,
          text:
            `❌ ${mentionPlayer(attacker)} şutunu çekti ancak top ` +
            `kaleyi bulmadı.`
        };
      }
    } else if (eventRoll < 0.50) {
      if (attackTeam1 === 1) state.corners1++;
      else state.corners2++;

      event = {
        minute: state.minute,
        text:
          `🚩 ${attackTeam.name} korner kazandı.\n` +
          `🎯 ${mentionPlayer(midfielder)} korneri kullanıyor...`
      };
    } else if (eventRoll < 0.60) {
      event = {
        minute: state.minute,
        text:
          `🔄 ${mentionPlayer(midfielder)} orta sahada oyunun yönünü değiştiriyor.`
      };
    } else if (eventRoll < 0.68) {
      event = {
        minute: state.minute,
        text:
          `💨 ${mentionPlayer(attacker)} kanattan ilerliyor ve ` +
          `orta açıyor!`
      };
    } else if (eventRoll < 0.75) {
      event = {
        minute: state.minute,
        text:
          `🧱 ${mentionPlayer(defender)} kritik bir müdahaleyle topu uzaklaştırdı.`
      };
    } else {
      event = {
        minute: state.minute,
        text:
          `⚔️ Orta sahada sert bir mücadele yaşanıyor. Top ${attackTeam.name}'de.`
      };
    }

    if (attackTeam1 === 1) {
      state.possession1 = Math.max(35, Math.min(65, state.possession1 + (Math.random() * 6 - 2)));
      state.possession2 = 100 - state.possession1;
    } else {
      state.possession2 = Math.max(35, Math.min(65, state.possession2 + (Math.random() * 6 - 2)));
      state.possession1 = 100 - state.possession2;
    }

    state.events.unshift(event);
    state.events = state.events.slice(0, 6);

    const eventText = state.events.map(makeEventText).join("\n\n");

    const liveEmbed = new EmbedBuilder()
      .setTitle(`🔴 CANLI — ${state.team1.name} 🆚 ${state.team2.name}`)
      .setDescription(
        `## ${state.team1.name} **${state.score1} - ${state.score2}** ${state.team2.name}\n\n` +
        `⏱️ **${state.minute}' / 90'**\n\n` +
        eventText
      )
      .addFields(
        {
          name: "📊 İstatistik",
          value:
            `🎯 Şut: **${state.shots1} - ${state.shots2}**\n` +
            `🧤 Kurtarış: **${state.saves1} - ${state.saves2}**\n` +
            `🚩 Korner: **${state.corners1} - ${state.corners2}**`
        },
        {
          name: "📈 Topa Sahip Olma",
          value:
            `**${state.team1.name}:** ${Math.round(state.possession1)}%\n` +
            `**${state.team2.name}:** ${Math.round(state.possession2)}%`
        },
        {
          name: "🏟️ Saha",
          value: "0m ━━━━━ 25m ━━━━━ 50m ━━━━━ 75m ━━━━━ 100m"
        }
      )
      .setFooter({
        text: "🔴 CANLI MAÇ • 3 saniye = 1 dakika"
      })
      .setTimestamp();

    await state.message.edit({ embeds: [liveEmbed] }).catch(() => {});

    if (state.minute >= 90) {
      clearInterval(state.interval);
      await finishMatch(state);
    }
  }, 3000);
}

async function finishMatch(state) {
  const {
    guild,
    team1,
    team2,
    score1,
    score2
  } = state;

  activeMatches.delete(state.key);

  const result1 =
    score1 > score2 ? "W" :
    score1 < score2 ? "L" : "D";

  const result2 =
    score2 > score1 ? "W" :
    score2 < score1 ? "L" : "D";

  db.prepare(`
    UPDATE standings
    SET played=played+1,
        wins=wins+?,
        draws=draws+?,
        losses=losses+?,
        gf=gf+?,
        ga=ga+?,
        points=points+?
    WHERE guild_id=? AND team_id=?
  `).run(
    result1 === "W" ? 1 : 0,
    result1 === "D" ? 1 : 0,
    result1 === "L" ? 1 : 0,
    score1,
    score2,
    result1 === "W" ? 3 : result1 === "D" ? 1 : 0,
    guild.id,
    team1.team_id
  );

  db.prepare(`
    UPDATE standings
    SET played=played+1,
        wins=wins+?,
        draws=draws+?,
        losses=losses+?,
        gf=gf+?,
        ga=ga+?,
        points=points+?
    WHERE guild_id=? AND team_id=?
  `).run(
    result2 === "W" ? 1 : 0,
    result2 === "D" ? 1 : 0,
    result2 === "L" ? 1 : 0,
    score2,
    score1,
    result2 === "W" ? 3 : result2 === "D" ? 1 : 0,
    guild.id,
    team2.team_id
  );

  const allPlayers = [
    ...state.p1.filter(p => p.user_id !== "0"),
    ...state.p2.filter(p => p.user_id !== "0")
  ];

  for (const p of allPlayers) {
    db.prepare(`
      UPDATE players SET matches=matches+1
      WHERE guild_id=? AND user_id=?
    `).run(guild.id, p.user_id);
  }

  const candidateRows = allPlayers
    .map(p => {
      const fresh = getPlayer(guild.id, p.user_id);
      if (!fresh) return null;

      const score =
        fresh.goals * 5 +
        fresh.assists * 3 +
        fresh.saves * 2 +
        fresh.shots;

      return { player: fresh, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const mvp = candidateRows[0]?.player;

  if (mvp) {
    await setValue(
      guild,
      await guild.members.fetch(mvp.user_id).then(m => m.user).catch(() => null) || { id: mvp.user_id, username: mvp.name },
      5_000_000,
      guild.client.user.id,
      "MAC_MVP"
    ).catch(() => {});

    db.prepare(`
      UPDATE players SET mvp=mvp+1
      WHERE guild_id=? AND user_id=?
    `).run(guild.id, mvp.user_id);
  }

  if (state.fixtureId) {
    db.prepare(`
      UPDATE fixtures SET status='TAMAMLANDI'
      WHERE id=?
    `).run(state.fixtureId);
  }

  const finalEmbed = new EmbedBuilder()
    .setTitle("🏁 MAÇ SONA ERDİ")
    .setDescription(
      `# ${team1.name} **${score1} - ${score2}** ${team2.name}\n\n` +
      `🎙️ **90 dakika tamamlandı.**`
    )
    .addFields(
      {
        name: "📊 Maç İstatistikleri",
        value:
          `🎯 Şut: **${state.shots1} - ${state.shots2}**\n` +
          `🧤 Kurtarış: **${state.saves1} - ${state.saves2}**\n` +
          `🚩 Korner: **${state.corners1} - ${state.corners2}**`
      },
      {
        name: "⭐ Maçın Oyuncusu",
        value: mvp
          ? `${mentionPlayer(mvp)}\n💰 **+5M€**`
          : "Oyuncu verisi bulunamadı."
      },
      {
        name: "🏆 Sonuç",
        value:
          result1 === "W"
            ? `🥇 ${team1.name} kazandı!`
            : result2 === "W"
              ? `🥇 ${team2.name} kazandı!`
              : "🤝 Maç berabere bitti."
      }
    )
    .setFooter({ text: "Axera League • Maç tamamlandı" })
    .setTimestamp();

  await state.message.edit({
    embeds: [finalEmbed]
  }).catch(() => {});
}

function registrationPanel(panelId, targetId, nickname, creatorId) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("📋 AXERA LEAGUE KAYIT PANELİ")
        .setDescription(
          `👤 **Üye:** <@${targetId}>\n` +
          `🏷️ **Takma Adı:** ${nickname}\n\n` +
          `Aşağıdaki butonlardan üyeye verilecek türü seçin.`
        )
        .setFooter({ text: "Panel sadece kayıt işlemini başlatan yetkili tarafından kullanılabilir." })
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`register:futbolcu:${panelId}`)
          .setLabel("⚽ Futbolcu")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`register:kaleci:${panelId}`)
          .setLabel("🧤 Kaleci")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`register:td:${panelId}`)
          .setLabel("📋 Teknik Direktör")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`register:üye:${panelId}`)
          .setLabel("👤 Üye")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

async function finishRegistration(interaction, type, panel) {
  if (interaction.user.id !== panel.creatorId) {
    return interaction.reply({
      content: "❌ Bu kayıt panelini yalnızca paneli oluşturan Kayıt Yetkilisi kullanabilir.",
      ephemeral: true
    });
  }

  const member = await interaction.guild.members
    .fetch(panel.targetId)
    .catch(() => null);

  if (!member) {
    return interaction.reply({
      content: "❌ Üye bulunamadı.",
      ephemeral: true
    });
  }

  const roles = [
    ROLE_IDS.FUTBOLCU,
    ROLE_IDS.KALECI,
    ROLE_IDS.TD,
    ROLE_IDS.KAYITSIZ
  ].filter(Boolean);

  for (const id of roles) {
    await member.roles.remove(id).catch(() => {});
  }

  let selectedRole = null;
  let position = "SNT";

  if (type === "futbolcu") {
    selectedRole = ROLE_IDS.FUTBOLCU;
    position = "SNT";
  }

  if (type === "kaleci") {
    selectedRole = ROLE_IDS.KALECI;
    position = "KL";
  }

  if (type === "td") {
    selectedRole = ROLE_IDS.TD;
    position = "TD";
  }

  if (type === "üye") {
    selectedRole = null;
    position = "SNT";
  }

  if (selectedRole) {
    await member.roles.add(selectedRole).catch(() => {});
  }

  ensurePlayer(
    interaction.guild.id,
    member.id,
    member.user.username
  );

  db.prepare(`
    UPDATE players
    SET name=?, position=?
    WHERE guild_id=? AND user_id=?
  `).run(
    panel.nickname,
    position,
    interaction.guild.id,
    member.id
  );

  if (panel.nickname) {
    await member.setNickname(
      `${panel.nickname} | 0M€`.slice(0, 32)
    ).catch(() => {});
  }

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle("✅ KAYIT TAMAMLANDI")
        .setDescription(
          `👤 Üye: ${member}\n` +
          `🏷️ Takma Ad: **${panel.nickname}**\n` +
          `📋 Tür: **${type === "futbolcu" ? "Futbolcu" :
            type === "kaleci" ? "Kaleci" :
            type === "td" ? "Teknik Direktör" : "Üye"}**\n\n` +
          `💰 Başlangıç değeri: **0M€**`
        )
        .setTimestamp()
    ],
    components: []
  });

  registrationPanels.delete(panel.id);
}

function ticketPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 AXERA LEAGUE DESTEK")
        .setDescription(
          "Destek talebi oluşturmak için aşağıdaki butona bas."
        )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket:create")
          .setLabel("🎫 Ticket Oluştur")
          .setStyle(ButtonStyle.Primary)
      )
    ]
  };
}

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith("register:")) {
      const [, type, id] = interaction.customId.split(":");
      const panel = registrationPanels.get(id);

      if (!panel) {
        return interaction.reply({
          content: "❌ Bu kayıt panelinin süresi dolmuş.",
          ephemeral: true
        });
      }

      return finishRegistration(
        interaction,
        type === "üye" ? "üye" : type,
        panel
      );
    }

    if (interaction.customId === "ticket:create") {
      const guild = interaction.guild;

      const existing = guild.channels.cache.find(
        c => c.name === `ticket-${interaction.user.id}`
      );

      if (existing) {
        return interaction.reply({
          content: `❌ Zaten açık ticketın var: ${existing}`,
          ephemeral: true
        });
      }

      const supportRoles = [
        ROLE_IDS.KAYIT,
        ROLE_IDS.DEGER,
        ROLE_IDS.MAC
      ].filter(Boolean);

      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ];

      for (const roleId of supportRoles) {
        overwrites.push({
          id: roleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        });
      }

      const channel = await guild.channels.create({
        name: `ticket-${interaction.user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites
      }).catch(() => null);

      if (!channel) {
        return interaction.reply({
          content: "❌ Ticket oluşturulamadı.",
          ephemeral: true
        });
      }

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎫 DESTEK TALEBİ")
            .setDescription(
              `${interaction.user} ticket açtı.\n\n` +
              `Yetkili en kısa sürede ilgilenecektir.\n` +
              `🔒 Ticketı kapatmak için butonu kullanın.`
            )
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("ticket:close")
              .setLabel("🔒 Ticket Kapat")
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      return interaction.reply({
        content: `✅ Ticket oluşturuldu: ${channel}`,
        ephemeral: true
      });
    }

    if (interaction.customId === "ticket:close") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: "❌ Ticket kapatma yetkin yok.",
          ephemeral: true
        });
      }

      await interaction.reply("🔒 Ticket kapatılıyor...");

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 1500);
    }
  } catch (err) {
    console.error(err);

    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({
        content: "❌ İşlem sırasında hata oluştu.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.on("guildMemberAdd", async member => {
  const role = member.guild.roles.cache.get(ROLE_IDS.KAYITSIZ);

  if (role) {
    await member.roles.add(role).catch(() => {});
  }

  const channel = member.guild.channels.cache.get(CHANNEL_IDS.KAYIT);

  if (channel) {
    await channel.send(
      `👋 ${member} hoşgeldin sunucumuza!\n` +
      `📋 <@&${ROLE_IDS.KAYIT}> seninle ilgilenecektir.`
    ).catch(() => {});
  }
});

client.on("messageCreate", async message => {
  if (
    message.author.bot ||
    !message.guild ||
    !message.content.startsWith(PREFIX)
  ) return;

  const raw = message.content.slice(PREFIX.length).trim();

  if (!raw) return;

  const parts = raw.split(/\s+/);
  const cmd = parts.shift().toLowerCase();
  const args = parts;

  try {
    /*
      =========================
      KAYIT
      =========================
    */

    if (cmd === "k") {
      if (!hasRole(message.member, ROLE_IDS.KAYIT)) {
        return message.reply("❌ Kayıt Yetkilisi değilsin.");
      }

      if (!allowedChannel(message, CHANNEL_IDS.KAYIT)) {
        return message.reply("❌ Bu komut sadece kayıt kanalında kullanılabilir.");
      }

      const target = message.mentions.members.first();

      if (!target) {
        return message.reply(
          "❌ Kullanım: `.k @Oyuncu TakmaAdı`"
        );
      }

      const nickname = args
        .filter(x => !/^<@!?\d+>$/.test(x))
        .join(" ")
        .trim();

      if (!nickname) {
        return message.reply(
          "❌ Takma ad yazmalısın."
        );
      }

      if (nickname.length > 24) {
        return message.reply(
          "❌ Takma ad en fazla 24 karakter olabilir."
        );
      }

      const id = `${message.id}`;

      registrationPanels.set(id, {
        id,
        targetId: target.id,
        nickname,
        creatorId: message.author.id
      });

      return message.channel.send(
        registrationPanel(
          id,
          target.id,
          nickname,
          message.author.id
        )
      );
    }

    if (cmd === "kayıtsızver" || cmd === "kayitsizver") {
      if (!hasRole(message.member, ROLE_IDS.KAYIT)) {
        return message.reply("❌ Kayıt Yetkilisi değilsin.");
      }

      const member = message.mentions.members.first();

      if (!member) {
        return message.reply(
          "❌ Kullanım: `.kayıtsızver @Oyuncu`"
        );
      }

      for (const id of [
        ROLE_IDS.FUTBOLCU,
        ROLE_IDS.KALECI,
        ROLE_IDS.TD
      ]) {
        await member.roles.remove(id).catch(() => {});
      }

      await member.roles.add(ROLE_IDS.KAYITSIZ).catch(() => {});

      return message.reply(
        `✅ ${member} artık **Kayıtsız**.`
      );
    }

    /*
      =========================
      DEĞER
      =========================
    */

    if (cmd === "dver" || cmd === "dsil") {
      if (!hasRole(message.member, ROLE_IDS.DEGER)) {
        return message.reply("❌ Değer Yetkilisi değilsin.");
      }

      if (!allowedChannel(message, CHANNEL_IDS.DEGER)) {
        return message.reply(
          "❌ `.dver` ve `.dsil` sadece Değer kanalında kullanılabilir."
        );
      }

      const user = message.mentions.users.first();
      const amount = parseMoney(args[1]);

      if (!user || !Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          `❌ Kullanım: \`.${cmd} @Oyuncu 5M\``
        );
      }

      const result = await setValue(
        message.guild,
        user,
        cmd === "dver" ? amount : -amount,
        message.author.id,
        cmd.toUpperCase()
      );

      return message.reply(
        `✅ ${user} yeni değeri: **${money(result.newValue)}**`
      );
    }

    /*
      =========================
      ANTRENMAN
      =========================
    */

    if (cmd === "ant" || cmd === "antrenman") {
      if (!allowedChannel(message, CHANNEL_IDS.ANTRENMAN)) {
        return message.reply(
          "❌ Bu komut sadece Antrenman kanalında kullanılabilir."
        );
      }

      const p = ensurePlayer(
        message.guild.id,
        message.author.id,
        message.author.username
      );

      const now = Date.now();
      const cooldown = 60 * 60 * 1000;

      if (p.training_last && now - p.training_last < cooldown) {
        const left = cooldown - (now - p.training_last);
        const minutes = Math.ceil(left / 60000);

        return message.reply(
          `⏳ Bir sonraki antrenman için **${minutes} dakika** beklemelisin.`
        );
      }

      let progress = p.training_progress + 1;
      let reward = 0;

      if (progress >= 5) {
        progress = 0;
        reward = 5_000_000;

        await setValue(
          message.guild,
          message.author,
          reward,
          message.author.id,
          "ANTRENMAN"
        );
      }

      db.prepare(`
        UPDATE players
        SET training_progress=?,
            training_last=?
        WHERE guild_id=? AND user_id=?
      `).run(
        progress,
        now,
        message.guild.id,
        message.author.id
      );

      return message.reply(
        `🏋️ **Antrenman tamamlandı!**\n` +
        `📈 İlerleme: **${progress}/5**\n` +
        (reward
          ? `💰 5/5 tamamlandı: **+5M€**`
          : "⏳ Bir sonraki aşamaya devam edebilirsin.")
      );
    }

    /*
      =========================
      PENALTI
      =========================
    */

    if (
      cmd === "pen" ||
      cmd === "penaltı" ||
      cmd === "penalti"
    ) {
      if (!allowedChannel(message, CHANNEL_IDS.PENALTI)) {
        return message.reply(
          "❌ Bu komut sadece Penaltı kanalında kullanılabilir."
        );
      }

      const p = ensurePlayer(
        message.guild.id,
        message.author.id,
        message.author.username
      );

      const roll = Math.random();

      db.prepare(`
        UPDATE players
        SET shots=shots+1
        WHERE guild_id=? AND user_id=?
      `).run(message.guild.id, message.author.id);

      if (roll < 0.50) {
        await setValue(
          message.guild,
          message.author,
          5_000_000,
          message.author.id,
          "PENALTI_GOL"
        );

        db.prepare(`
          UPDATE players
          SET goals=goals+1
          WHERE guild_id=? AND user_id=?
        `).run(message.guild.id, message.author.id);

        return message.reply(
          `🥅 **GOOOOL!** ⚽\n` +
          `🧤 Axera Kalecisi topu çıkaramadı!\n` +
          `💰 **+5M€ değer**`
        );
      }

      if (roll < 0.75) {
        return message.reply(
          `💥 **DİREK!**\n` +
          `Top direkten döndü!\n` +
          `💰 Değer artışı yok.`
        );
      }

      return message.reply(
        `🧤 **KURTARIŞ!**\n` +
        `Axera Kalecisi penaltıyı çıkardı!`
      );
    }

    /*
      =========================
      TWEET
      =========================
    */

    if (cmd === "tweet") {
      const text = args.join(" ").trim();

      await message.delete().catch(() => {});

      if (!text) return;

      const p = ensurePlayer(
        message.guild.id,
        message.author.id,
        message.author.username
      );

      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;

      let reward = false;

      if (!p.tweet_last || now - p.tweet_last >= cooldown) {
        reward = true;

        db.prepare(`
          UPDATE players
          SET tweet_last=?
          WHERE guild_id=? AND user_id=?
        `).run(now, message.guild.id, message.author.id);
      }

      if (reward) {
        await setValue(
          message.guild,
          message.author,
          5_000_000,
          message.author.id,
          "TWEET"
        );
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: message.member.displayName,
          iconURL: message.author.displayAvatarURL()
        })
        .setDescription(text)
        .setFooter({
          text: reward
            ? "Axera League • Tweet • +5M€"
            : "Axera League • Tweet"
        })
        .setTimestamp();

      return message.channel.send({
        embeds: [embed]
      });
    }

    /*
      =========================
      PROFİL
      =========================
    */

    if (cmd === "profil" || cmd === "profile") {
      const user =
        message.mentions.users.first() ||
        message.author;

      const p = getPlayer(
        message.guild.id,
        user.id
      );

      if (!p) {
        return message.reply(
          "❌ Bu oyuncunun profili bulunamadı."
        );
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`⚽ ${p.name || user.username}`)
            .setThumbnail(user.displayAvatarURL())
            .setDescription(
              `👤 Oyuncu: ${user}\n` +
              `📍 Mevki: **${positionLabel(p.position)}**\n` +
              `💰 Değer: **${money(p.value)}**\n` +
              `💵 Bütçe: **${money(p.budget)}**\n\n` +
              `⚽ Gol: **${p.goals}**\n` +
              `🅰️ Asist: **${p.assists}**\n` +
              `🎯 Şut: **${p.shots}**\n` +
              `🧤 Kurtarış: **${p.saves}**\n` +
              `🏟️ Maç: **${p.matches}**\n` +
              `⭐ MVP: **${p.mvp}**\n\n` +
              `🏋️ Antrenman: **${p.training_progress}/5**`
            )
            .setTimestamp()
        ]
      });
    }

    /*
      =========================
      OYUNCU ARAMA
      =========================
    */

    if (cmd === "ara") {
      if ((args[0] || "").toLowerCase() !== "futbolcu") {
        return message.reply(
          "❌ Kullanım: `.ara futbolcu isim`"
        );
      }

      const query = args.slice(1).join(" ").trim();

      if (!query) {
        return message.reply(
          "❌ Futbolcu adı yaz."
        );
      }

      const rows = db.prepare(`
        SELECT *
        FROM players
        WHERE guild_id=?
        AND LOWER(name) LIKE LOWER(?)
        ORDER BY value DESC
        LIMIT 10
      `).all(
        message.guild.id,
        `%${query}%`
      );

      if (!rows.length) {
        return message.reply(
          "🔎 Kayıtlı oyuncu bulunamadı."
        );
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔎 FUTBOLCU ARAMA")
            .setDescription(
              rows.map((p, i) =>
                `**${i + 1}. ${p.name}** <@${p.user_id}>\n` +
                `📍 ${positionLabel(p.position)} • 💰 ${money(p.value)}`
              ).join("\n\n")
            )
        ]
      });
    }

    /*
      =========================
      DEĞERLER
      =========================
    */

    if (cmd === "değerler" || cmd === "degerler") {
      const rows = db.prepare(`
        SELECT *
        FROM players
        WHERE guild_id=?
        ORDER BY value DESC
        LIMIT 15
      `).all(message.guild.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("💰 AXERA LEAGUE EN DEĞERLİLER")
            .setDescription(
              rows.length
                ? rows.map((p, i) =>
                    `**${i + 1}. ${p.name}** <@${p.user_id}> — **${money(p.value)}**`
                  ).join("\n")
                : "Henüz oyuncu yok."
            )
        ]
      });
    }

    /*
      =========================
      BÜTÇE
      =========================
    */

    if (cmd === "bütçe" || cmd === "butce") {
      const user =
        message.mentions.users.first() ||
        message.author;

      const p = ensurePlayer(
        message.guild.id,
        user.id,
        user.username
      );

      return message.reply(
        `💵 ${user} kişisel bütçesi: **${money(p.budget)}**`
      );
    }

    if (cmd === "gönder" || cmd === "gonder") {
      const target = message.mentions.users.first();
      const amount = parseMoney(args[1]);

      if (!target || !Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          "❌ Kullanım: `.gönder @Oyuncu 50M`"
        );
      }

      if (target.id === message.author.id) {
        return message.reply(
          "❌ Kendine bütçe gönderemezsin."
        );
      }

      const sender = ensurePlayer(
        message.guild.id,
        message.author.id,
        message.author.username
      );

      const receiver = ensurePlayer(
        message.guild.id,
        target.id,
        target.username
      );

      if (sender.budget < amount) {
        return message.reply(
          "❌ Yeterli bütçen yok."
        );
      }

      db.prepare(`
        UPDATE players SET budget=budget-?
        WHERE guild_id=? AND user_id=?
      `).run(
        amount,
        message.guild.id,
        message.author.id
      );

      db.prepare(`
        UPDATE players SET budget=budget+?
        WHERE guild_id=? AND user_id=?
      `).run(
        amount,
        message.guild.id,
        target.id
      );

      return message.reply(
        `✅ ${target} kullanıcısına **${money(amount)}** gönderildi.`
      );
    }

    if (cmd === "paraekle") {
      if (!hasRole(message.member, ROLE_IDS.DEGER)) {
        return message.reply("❌ Yetkin yok.");
      }

      const user = message.mentions.users.first();
      const amount = parseMoney(args[1]);

      if (!user || !Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          "❌ Kullanım: `.paraekle @Oyuncu 50M`"
        );
      }

      ensurePlayer(
        message.guild.id,
        user.id,
        user.username
      );

      db.prepare(`
        UPDATE players SET budget=budget+?
        WHERE guild_id=? AND user_id=?
      `).run(
        amount,
        message.guild.id,
        user.id
      );

      return message.reply(
        `✅ ${user} bütçesine **${money(amount)}** eklendi.`
      );
    }

    if (cmd === "parasil") {
      if (!hasRole(message.member, ROLE_IDS.DEGER)) {
        return message.reply("❌ Yetkin yok.");
      }

      const user = message.mentions.users.first();
      const amount = parseMoney(args[1]);

      if (!user || !Number.isFinite(amount) || amount <= 0) {
        return message.reply(
          "❌ Kullanım: `.parasil @Oyuncu 20M`"
        );
      }

      const p = ensurePlayer(
        message.guild.id,
        user.id,
        user.username
      );

      const newBudget = Math.max(
        0,
        p.budget - amount
      );

      db.prepare(`
        UPDATE players SET budget=?
        WHERE guild_id=? AND user_id=?
      `).run(
        newBudget,
        message.guild.id,
        user.id
      );

      return message.reply(
        `✅ Yeni bütçe: **${money(newBudget)}**`
      );
    }

    if (cmd === "paraayarla") {
      if (!hasRole(message.member, ROLE_IDS.DEGER)) {
        return message.reply("❌ Yetkin yok.");
      }

      const user = message.mentions.users.first();
      const amount = parseMoney(args[1]);

      if (!user || !Number.isFinite(amount) || amount < 0) {
        return message.reply(
          "❌ Kullanım: `.paraayarla @Oyuncu 100M`"
        );
      }

      ensurePlayer(
        message.guild.id,
        user.id,
        user.username
      );

      db.prepare(`
        UPDATE players SET budget=?
        WHERE guild_id=? AND user_id=?
      `).run(
        amount,
        message.guild.id,
        user.id
      );

      return message.reply(
        `✅ ${user} bütçesi **${money(amount)}** olarak ayarlandı.`
      );
    }

    /*
      =========================
      TAKIM
      =========================
    */

    if (cmd === "takımekle" || cmd === "takimekle") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takımekle @Takım`"
        );
      }

      if (getTeam(message.guild.id, role.id)) {
        return message.reply(
          "❌ Bu takım zaten kayıtlı."
        );
      }

      db.prepare(`
        INSERT INTO teams(guild_id,team_id,name)
        VALUES(?,?,?)
      `).run(
        message.guild.id,
        role.id,
        role.name
      );

      db.prepare(`
        INSERT OR IGNORE INTO standings(guild_id,team_id)
        VALUES(?,?)
      `).run(
        message.guild.id,
        role.id
      );

      return message.reply(
        `✅ ${role} takımı lige eklendi.`
      );
    }

    if (
      cmd === "takımkaldır" ||
      cmd === "takimkaldir"
    ) {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.takımkaldır @Takım`"
        );
      }

      const active = [...activeMatches.values()]
        .some(m =>
          m.team1.team_id === role.id ||
          m.team2.team_id === role.id
        );

      if (active) {
        return message.reply(
          "❌ Bu takım şu anda maç yapıyor."
        );
      }

      db.prepare(`
        DELETE FROM teams
        WHERE guild_id=? AND team_id=?
      `).run(message.guild.id, role.id);

      db.prepare(`
        DELETE FROM standings
        WHERE guild_id=? AND team_id=?
      `).run(message.guild.id, role.id);

      db.prepare(`
        DELETE FROM team_members
        WHERE guild_id=? AND team_id=?
      `).run(message.guild.id, role.id);

      return message.reply(
        `✅ ${role} ligden kaldırıldı.`
      );
    }

    if (cmd === "takımdeğer" || cmd === "takimdeger") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();
      const amount = parseMoney(args[1]);

      if (!role || !Number.isFinite(amount) || amount < 0) {
        return message.reply(
          "❌ Kullanım: `.takımdeğer @Takım 850M`"
        );
      }

      if (!getTeam(message.guild.id, role.id)) {
        return message.reply(
          "❌ Takım kayıtlı değil."
        );
      }

      db.prepare(`
        UPDATE teams SET value=?
        WHERE guild_id=? AND team_id=?
      `).run(
        Math.min(MAX_VALUE, amount),
        message.guild.id,
        role.id
      );

      return message.reply(
        `✅ ${role} takım değeri: **${money(Math.min(MAX_VALUE, amount))}**`
      );
    }

    if (cmd === "kadroekle") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();
      const user = message.mentions.users.first();

      if (!role || !user) {
        return message.reply(
          "❌ Kullanım: `.kadroekle @Takım @Oyuncu Pozisyon`"
        );
      }

      const position = args
        .filter(x => !x.startsWith("<@"))
        .filter(x => !x.startsWith("<@&"))
        .join(" ")
        .toUpperCase();

      const valid = [
        "KL","STP","SĞB","SLB","MO",
        "MOO","SĞK","SLK","SNT"
      ];

      if (!valid.includes(position)) {
        return message.reply(
          `❌ Pozisyon: ${valid.join(", ")}`
        );
      }

      if (!getTeam(message.guild.id, role.id)) {
        return message.reply(
          "❌ Takım kayıtlı değil."
        );
      }

      ensurePlayer(
        message.guild.id,
        user.id,
        user.username
      );

      db.prepare(`
        INSERT INTO team_members(
          guild_id,team_id,user_id,position
        )
        VALUES(?,?,?,?)
        ON CONFLICT(guild_id,team_id,user_id)
        DO UPDATE SET position=excluded.position
      `).run(
        message.guild.id,
        role.id,
        user.id,
        position
      );

      saveTeamValue(
        message.guild.id,
        role.id
      );

      return message.reply(
        `✅ ${user} → ${role} kadrosuna **${position}** olarak eklendi.`
      );
    }

    if (
      cmd === "kadrocikar" ||
      cmd === "kadrocıkart"
    ) {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();
      const user = message.mentions.users.first();

      if (!role || !user) {
        return message.reply(
          "❌ Kullanım: `.kadrocikar @Takım @Oyuncu`"
        );
      }

      db.prepare(`
        DELETE FROM team_members
        WHERE guild_id=? AND team_id=? AND user_id=?
      `).run(
        message.guild.id,
        role.id,
        user.id
      );

      saveTeamValue(
        message.guild.id,
        role.id
      );

      return message.reply(
        `✅ ${user} kadrodan çıkarıldı.`
      );
    }

    if (cmd === "kadro") {
      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.kadro @Takım`"
        );
      }

      const players = teamPlayers(
        message.guild.id,
        role.id
      );

      if (!players.length) {
        return message.reply(
          "📋 Bu takımın kadrosu boş."
        );
      }

      const groups = {};

      for (const p of players) {
        if (!groups[p.team_position]) {
          groups[p.team_position] = [];
        }

        groups[p.team_position].push(
          `${mentionPlayer(p)} — **${money(p.value)}**`
        );
      }

      const text = Object.entries(groups)
        .map(([pos, list]) =>
          `### ${positionLabel(pos)}\n${list.join("\n")}`
        )
        .join("\n\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📋 ${role.name} KADROSU`)
            .setDescription(text)
            .addFields({
              name: "💰 Toplam Takım Değeri",
              value: `**${money(teamValue(message.guild.id, role.id))}**`
            })
        ]
      });
    }

    /*
      =========================
      PUAN
      =========================
    */

    if (cmd === "puan") {
      if (!allowedChannel(message, CHANNEL_IDS.PUAN)) {
        return message.reply(
          "❌ Bu komut sadece Puan kanalında kullanılabilir."
        );
      }

      return message.reply({
        embeds: [standingsEmbed(message.guild.id)]
      });
    }

    if (cmd === "puanekle") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();
      const amount = Number(args[1]);

      if (!role || !Number.isInteger(amount) || amount < 0) {
        return message.reply(
          "❌ Kullanım: `.puanekle @Takım miktar`"
        );
      }

      db.prepare(`
        UPDATE standings
        SET points=points+?
        WHERE guild_id=? AND team_id=?
      `).run(
        amount,
        message.guild.id,
        role.id
      );

      return message.reply(
        `✅ ${role} takımına **${amount} puan** eklendi.`
      );
    }

    /*
      =========================
      MAÇ
      =========================
    */

    if (cmd === "maç" || cmd === "mac") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      if (!matchChannel(message)) {
        return message.reply(
          "❌ `.maç` sadece Maç kanalında kullanılabilir."
        );
      }

      const roles = message.mentions.roles;

      const team1Role = roles.at(0);
      const team2Role = roles.at(1);

      if (!team1Role || !team2Role) {
        return message.reply(
          "❌ Kullanım: `.maç @Takım1 @Takım2`"
        );
      }

      if (team1Role.id === team2Role.id) {
        return message.reply(
          "❌ Bir takım kendisiyle oynayamaz."
        );
      }

      const team1 = getTeam(
        message.guild.id,
        team1Role.id
      );

      const team2 = getTeam(
        message.guild.id,
        team2Role.id
      );

      if (!team1 || !team2) {
        return message.reply(
          "❌ Önce takımları `.takımekle` ile eklemelisin."
        );
      }

      const busy = [...activeMatches.values()]
        .some(m =>
          m.team1.team_id === team1.team_id ||
          m.team2.team_id === team1.team_id ||
          m.team1.team_id === team2.team_id ||
          m.team2.team_id === team2.team_id
        );

      if (busy) {
        return message.reply(
          "❌ Bu takımlardan biri zaten maç yapıyor."
        );
      }

      return startLiveMatch(
        message.guild,
        team1,
        team2,
        message.channel
      );
    }

    /*
      =========================
      FİKSTÜR
      =========================
    */

    if (cmd === "fiksturekle") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const roles = message.mentions.roles;

      const team1 = roles.at(0);
      const team2 = roles.at(1);

      const date = args
        .filter(x => !x.startsWith("<@&"))
        .join(" ");

      if (!team1 || !team2 || !date) {
        return message.reply(
          "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
        );
      }

      const timestamp = new Date(date.replace(" ", "T")).getTime();

      if (!Number.isFinite(timestamp)) {
        return message.reply(
          "❌ Tarih formatı geçersiz."
        );
      }

      const t1 = getTeam(
        message.guild.id,
        team1.id
      );

      const t2 = getTeam(
        message.guild.id,
        team2.id
      );

      if (!t1 || !t2) {
        return message.reply(
          "❌ Takımlardan biri kayıtlı değil."
        );
      }

      db.prepare(`
        INSERT INTO fixtures(
          guild_id,team1,team2,timestamp
        )
        VALUES(?,?,?,?)
      `).run(
        message.guild.id,
        team1.id,
        team2.id,
        timestamp
      );

      return message.reply(
        `✅ Fikstür eklendi: ${team1} 🆚 ${team2}`
      );
    }

    if (cmd === "fikstür" || cmd === "fikstur") {
      const rows = db.prepare(`
        SELECT *
        FROM fixtures
        WHERE guild_id=?
        ORDER BY timestamp ASC
        LIMIT 20
      `).all(message.guild.id);

      if (!rows.length) {
        return message.reply(
          "📅 Henüz fikstür bulunmuyor."
        );
      }

      const text = rows.map(f => {
        const t1 = getTeam(message.guild.id, f.team1);
        const t2 = getTeam(message.guild.id, f.team2);

        return `🆔 **${f.id}** • ${t1?.name || "?"} 🆚 ${t2?.name || "?"}\n` +
          `🕐 <t:${Math.floor(f.timestamp / 1000)}:F> • **${f.status}**`;
      }).join("\n\n");

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🗓️ AXERA LEAGUE FİKSTÜR")
            .setDescription(text)
        ]
      });
    }

    if (cmd === "fiksturcikar") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const id = Number(args[0]);

      if (!Number.isInteger(id)) {
        return message.reply(
          "❌ Kullanım: `.fiksturcikar ID`"
        );
      }

      const result = db.prepare(`
        DELETE FROM fixtures
        WHERE id=? AND guild_id=?
      `).run(
        id,
        message.guild.id
      );

      return message.reply(
        result.changes
          ? "✅ Fikstür silindi."
          : "❌ Fikstür bulunamadı."
      );
    }

    /*
      =========================
      KUPA / MÜZE
      =========================
    */

    if (cmd === "kupaekle") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();

      const cupName = args
        .filter(x => !x.startsWith("<@&"))
        .join(" ")
        .trim();

      if (!role || !cupName) {
        return message.reply(
          "❌ Kullanım: `.kupaekle @Takım KupaAdı`"
        );
      }

      db.prepare(`
        INSERT INTO cups(guild_id,team_id,name,date)
        VALUES(?,?,?,?)
      `).run(
        message.guild.id,
        role.id,
        cupName,
        new Date().toLocaleDateString("tr-TR")
      );

      return message.reply(
        `🏆 ${role} takımına **${cupName}** kupası eklendi.`
      );
    }

    if (cmd === "kupasil") {
      if (!hasRole(message.member, ROLE_IDS.MAC)) {
        return message.reply("❌ Maç Yetkilisi değilsin.");
      }

      const role = message.mentions.roles.first();

      const cupName = args
        .filter(x => !x.startsWith("<@&"))
        .join(" ")
        .trim();

      if (!role || !cupName) {
        return message.reply(
          "❌ Kullanım: `.kupasil @Takım KupaAdı`"
        );
      }

      const result = db.prepare(`
        DELETE FROM cups
        WHERE guild_id=? AND team_id=? AND name=?
        LIMIT 1
      `).run(
        message.guild.id,
        role.id,
        cupName
      );

      return message.reply(
        result.changes
          ? "✅ Kupa silindi."
          : "❌ Kupa bulunamadı."
      );
    }

    if (cmd === "müze" || cmd === "muze") {
      const role = message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "❌ Kullanım: `.müze @Takım`"
        );
      }

      const cups = db.prepare(`
        SELECT *
        FROM cups
        WHERE guild_id=? AND team_id=?
        ORDER BY id DESC
      `).all(
        message.guild.id,
        role.id
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🏛️ ${role.name} MÜZESİ`)
            .setDescription(
              cups.length
                ? cups.map((c, i) =>
                    `🏆 **${i + 1}. ${c.name}** — ${c.date}`
                  ).join("\n")
                : "Bu takımın müzesinde kupa bulunmuyor."
            )
        ]
      });
    }

    /*
      =========================
      DM
      =========================
    */

    if (cmd === "dm") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Bu komut sadece yönetici içindir.");
      }

      const user = message.mentions.users.first();

      const text = args
        .filter(x => !x.startsWith("<@"))
        .join(" ")
        .trim();

      if (!user || !text) {
        return message.reply(
          "❌ Kullanım: `.dm @Oyuncu mesaj`"
        );
      }

      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📩 AXERA LEAGUE")
            .setDescription(text)
            .setTimestamp()
        ]
      }).catch(() => {
        throw new Error("DM gönderilemedi.");
      });

      return message.reply(
        `✅ ${user} kullanıcısına DM gönderildi.`
      );
    }

    /*
      =========================
      MODERASYON
      =========================
    */

    if (cmd === "sil") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const amount = Number(args[0]);

      if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
        return message.reply(
          "❌ 1-100 arasında miktar gir."
        );
      }

      const deleted = await message.channel.bulkDelete(
        amount + 1,
        true
      ).catch(() => null);

      if (!deleted) {
        return message.reply(
          "❌ Mesajlar silinemedi."
        );
      }

      const msg = await message.channel.send(
        `🧹 **${Math.max(0, deleted.size - 1)}** mesaj silindi.`
      );

      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 3000);

      return;
    }

    if (cmd === "kick") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const member = message.mentions.members.first();

      if (!member) {
        return message.reply(
          "❌ Kullanım: `.kick @Oyuncu`"
        );
      }

      await member.kick(
        args.slice(1).join(" ") || "Yetkili kararı"
      ).catch(() => {});

      return message.reply(
        `👢 ${member.user.tag} sunucudan atıldı.`
      );
    }

    if (cmd === "ban") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const member = message.mentions.members.first();

      if (!member) {
        return message.reply(
          "❌ Kullanım: `.ban @Oyuncu`"
        );
      }

      await member.ban({
        reason: args.slice(1).join(" ") || "Yetkili kararı"
      }).catch(() => {});

      return message.reply(
        `🔨 ${member.user.tag} yasaklandı.`
      );
    }

    if (cmd === "mute") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const member = message.mentions.members.first();

      if (!member) {
        return message.reply(
          "❌ Kullanım: `.mute @Oyuncu`"
        );
      }

      await member.timeout(
        10 * 60 * 1000,
        "Yetkili kararı"
      ).catch(() => {});

      return message.reply(
        `🔇 ${member} 10 dakika susturuldu.`
      );
    }

    if (cmd === "unmute") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const member = message.mentions.members.first();

      if (!member) {
        return message.reply(
          "❌ Kullanım: `.unmute @Oyuncu`"
        );
      }

      await member.timeout(
        null,
        "Yetkili tarafından susturma kaldırıldı"
      ).catch(() => {});

      return message.reply(
        `🔊 ${member} susturması kaldırıldı.`
      );
    }

    if (cmd === "embed") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      const [title, ...description] =
        args.join(" ").split("|");

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(title?.trim() || "Axera League")
            .setDescription(description.join("|").trim() || " ")
            .setTimestamp()
        ]
      });
    }

    if (cmd === "lock" || cmd === "kilit") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { SendMessages: false }
      );

      return message.reply("🔒 Kanal kilitlendi.");
    }

    if (cmd === "unlock" || cmd === "kilitaç") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { SendMessages: true }
      );

      return message.reply("🔓 Kanal açıldı.");
    }

    /*
      =========================
      ROL PANELİ
      =========================
    */

    if (cmd === "rolpanel") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔔 AXERA LEAGUE ROL PANELİ")
            .setDescription(
              "Bildirim rollerini almak için butonları kullan."
            )
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("notify:mac")
              .setLabel("⚽ Maç")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId("notify:duyuru")
              .setLabel("📢 Duyuru")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId("notify:transfer")
              .setLabel("🔄 Transfer")
              .setStyle(ButtonStyle.Primary)
          )
        ]
      });
    }

    /*
      =========================
      TICKET PANEL
      =========================
    */

    if (cmd === "ticketpanel") {
      if (!isAdmin(message.member)) {
        return message.reply("❌ Yetkin yok.");
      }

      return message.channel.send(ticketPanel());
    }

    /*
      =========================
      YARDIM
      =========================
    */

    if (cmd === "yardım" || cmd === "yardim" || cmd === "help") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🤖 AXERA LEAGUE KOMUTLARI")
            .setDescription(
              "### 📋 Kayıt\n" +
              "`.k @Oyuncu TakmaAdı`\n" +
              "`.kayıtsızver @Oyuncu`\n\n" +

              "### 💰 Değer\n" +
              "`.dver @Oyuncu 5M`\n" +
              "`.dsil @Oyuncu 5M`\n" +
              "`.değerler`\n\n" +

              "### 🏋️ Gelişim\n" +
              "`.ant` `.antrenman`\n" +
              "`.pen` `.penaltı`\n" +
              "`.tweet mesaj`\n\n" +

              "### ⚽ Maç\n" +
              "`.maç @Takım1 @Takım2`\n" +
              "`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`\n" +
              "`.fikstür`\n" +
              "`.fiksturcikar ID`\n" +
              "`.puan`\n\n" +

              "### 👥 Kadro\n" +
              "`.takımekle @Takım`\n" +
              "`.takımkaldır @Takım`\n" +
              "`.kadroekle @Takım @Oyuncu SNT`\n" +
              "`.kadrocikar @Takım @Oyuncu`\n" +
              "`.kadro @Takım`\n" +
              "`.takımdeğer @Takım 850M`\n\n" +

              "### 💵 Bütçe\n" +
              "`.bütçe`\n" +
              "`.gönder @Oyuncu 50M`\n" +
              "`.paraekle`\n" +
              "`.parasil`\n" +
              "`.paraayarla`\n\n" +

              "### 🏆 Kupa\n" +
              "`.kupaekle`\n" +
              "`.kupasil`\n" +
              "`.müze`\n\n" +

              "### 👤 Oyuncu\n" +
              "`.profil`\n" +
              "`.ara futbolcu isim`\n\n" +

              "### 🛡️ Yönetim\n" +
              "`.sil` `.kick` `.ban` `.mute` `.unmute`\n" +
              "`.lock` `.unlock` `.embed`\n" +
              "`.rolpanel` `.ticketpanel` `.dm`"
            )
        ]
      });
    }
  } catch (err) {
    console.error(err);

    return message.reply(
      "❌ İşlem sırasında hata oluştu."
    ).catch(() => {});
  }
});

/*
=========================================
FİKSTÜR OTOMATİK BAŞLATMA
=========================================
*/

setInterval(async () => {
  const now = Date.now();

  const fixtures = db.prepare(`
    SELECT *
    FROM fixtures
    WHERE timestamp <= ?
      AND status='BEKLIYOR'
    ORDER BY timestamp ASC
  `).all(now);

  for (const fixture of fixtures) {
    const guild = client.guilds.cache.get(
      fixture.guild_id
    );

    if (!guild) continue;

    const team1 = getTeam(
      guild.id,
      fixture.team1
    );

    const team2 = getTeam(
      guild.id,
      fixture.team2
    );

    const channel = guild.channels.cache.get(
      CHANNEL_IDS.MAC
    );

    if (!team1 || !team2 || !channel) continue;

    const busy = [...activeMatches.values()]
      .some(m =>
        m.team1.team_id === team1.team_id ||
        m.team2.team_id === team1.team_id ||
        m.team1.team_id === team2.team_id ||
        m.team2.team_id === team2.team_id
      );

    if (busy) continue;

    db.prepare(`
      UPDATE fixtures
      SET status='BASLIYOR'
      WHERE id=?
    `).run(fixture.id);

    await startLiveMatch(
      guild,
      team1,
      team2,
      channel,
      fixture.id
    );
  }
}, 1000);

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} aktif!`);
  console.log("⚽ Axera League sistemleri aktif.");
  console.log("🏟️ 100 metrelik canlı maç sistemi aktif.");
  console.log("🎙️ Canlı spiker sistemi aktif.");
  console.log("💰 Maksimum oyuncu değeri: 1.000M€");
  console.log("🐦 Tweet ödülü: 24 saatte +5M€");
});

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekle."
  );
  process.exit(1);
}

client.login(process.env.TOKEN);
