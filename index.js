require("dotenv").config();

const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TOKEN) throw new Error("TOKEN Railway Variables içine eklenmemiş.");
const ai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const IDS = {
  roles: {
    yonetici:"1534455282426445897",
    kayitYetkilisi:"1534456315366342716",
    deger:"1534456192913375382",
    kayitsiz:"1534457560134844517",
    futbolcu:"1534457228986421278",
    td:"1534456648930693120",
    uye:"1534457460163608636",
    kaleci:process.env.KALECI_ROLE_ID || null,
    moderator:"1534456108415189063",
    spiker:"1535251168169697390",
    medya:"1547393966553440346",
    partner:"1547393545827123230",
    macPing:"1547393416755941509",
    duyuru:"1547393331297001522",
    cekilis:"1545116885589430312"
  },
  channels: {
    kayit:"1547371464515133470",
    sohbet:"1547374641763455009",
    ant:"1547375589923618957",
    pen:"1547375997698052166",
    tweet:"1547377797193011340",
    mac:"1547376935410073692",
    puan:"1547382143775285431",
    deger:"1547376344927834122",
    durum:"1547388197796057118",
    ai:"1547375186754408539"
  },
  teams: {
    Barcelona:"1534480715779936297",
    "Real Madrid":"1534480984064528655",
    Galatasaray:"1534481073629691995",
    "Fenerbahçe":"1534481156840620183",
    Beşiktaş:"1534481259739348992",
    "Manchester United":"1534481426463068180"
  }
};

const DATA_FILE = path.join(__dirname,"data.json");

const DEFAULT = {
  users:{},
  teams:{},
  standings:{},
  fixtures:[],
  nextFixtureId:1,
  activeMatches:{},
  registrationPanels:{},
  tickets:{},
  formations:{},
  training:{},
  tweetCooldowns:{},
  matchRewards:{},
  stats:{},
  matchHistory:{},
  rolePanel:null
};

function loadData(){
  try{
    const x=JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
    return Object.assign({},DEFAULT,x);
  }catch{
    return JSON.parse(JSON.stringify(DEFAULT));
  }
}

let db=loadData();

function saveData(){
  fs.writeFileSync(DATA_FILE,JSON.stringify(db,null,2));
}

const client=new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials:[Partials.Channel]
});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const money=n=>`${Math.max(0,Math.round(Number(n)||0))}M€`;

function embed(title,description,color){
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color||0x2b2d31)
    .setTimestamp();
}

function hasRole(member,ids){
  return member?.roles?.cache?.some(r=>ids.includes(r.id));
}

function isAdmin(member){
  return member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    hasRole(member,[IDS.roles.yonetici]);
}

function isStaff(member){
  return isAdmin(member) ||
    hasRole(member,[
      IDS.roles.kayitYetkilisi,
      IDS.roles.deger,
      IDS.roles.spiker,
      IDS.roles.moderator
    ]);
}

function onlyChannel(message,id){
  if(message.channel.id!==id){
    message.reply(`❌ Bu komut <#${id}> kanalında kullanılabilir.`).catch(()=>{});
    return false;
  }
  return true;
}

function normalize(s){
  return String(s||"")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .trim();
}

function amountArg(s){
  if(!s)return null;

  const x=String(s)
    .replace(",",".")
    .trim()
    .toUpperCase()
    .replace(/€/g,"");

  if(!/^\d+(?:\.\d+)?M?$/.test(x))return null;

  const n=Number(x.replace(/M$/,""));

  return Number.isFinite(n)&&n>0?n:null;
}

function mentionUser(message){
  return message.mentions.members.first() ||
    message.guild?.members.cache.get(
      message.content.split(/\s+/)[1]?.replace(/[<@!>]/g,"")
    );
}

function playerName(member){
  return db.users[member.id]?.name ||
    member.nickname ||
    member.displayName ||
    member.user.username;
}

function parseNickValue(member){
  const m=(member.nickname||member.displayName||"")
    .match(/(\d+(?:\.\d+)?)M€\s*$/i);

  return m?Number(m[1]):0;
}

function setNickValue(oldNick,value){
  const base=String(oldNick||"")
    .replace(/\s*\d+(?:\.\d+)?M€\s*$/i,"")
    .trim();

  return `${base||"Oyuncu"} | ${money(value)}`.slice(0,32);
}

async function changePlayerValue(member,delta,reason=""){
  if(!member)return 0;

  if(!db.users[member.id])db.users[member.id]={};

  let current=Number(db.users[member.id].value);

  if(!Number.isFinite(current)||current<=0){
    current=parseNickValue(member);
  }

  const next=Math.min(
    1000,
    Math.max(0,current+Number(delta))
  );

  db.users[member.id].value=next;

  try{
    const currentNick=
      member.nickname||
      member.displayName||
      playerName(member);

    const newNick=setNickValue(currentNick,next);

    if(member.manageable){
      await member.setNickname(newNick);
    }
  }catch{}

  saveData();

  return next;
}

function ensureUser(member){
  if(!db.users[member.id]){
    db.users[member.id]={
      name:playerName(member),
      value:parseNickValue(member),
      budget:0
    };
  }

  if(!db.users[member.id].name){
    db.users[member.id].name=playerName(member);
  }

  if(!Number.isFinite(Number(db.users[member.id].value))){
    db.users[member.id].value=parseNickValue(member);
  }

  if(!Number.isFinite(Number(db.users[member.id].budget))){
    db.users[member.id].budget=0;
  }

  return db.users[member.id];
}

function teamByName(s){
  const n=normalize(s);

  if(!n)return null;

  const all={
    ...IDS.teams,
    ...Object.fromEntries(
      Object.entries(db.teams)
        .map(([name,t])=>[name,t.roleId])
        .filter(([,id])=>id)
    )
  };

  return Object.entries(all).find(
    ([name])=>normalize(name)===n
  )?.[0] ||
  Object.entries(all).find(
    ([name])=>
      normalize(name).includes(n)||
      n.includes(normalize(name))
  )?.[0];
}

function teamRole(guild,name){
  const roleId=
    IDS.teams[name]||
    db.teams[name]?.roleId;

  return roleId?
    guild.roles.cache.get(roleId):
    null;
}

function getUserTeams(guild,member){
  const names=[
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  return names.filter(name=>{
    const r=teamRole(guild,name);
    return r&&member?.roles?.cache?.has(r.id);
  });
}

function teamMembers(guild,name){
  const role=teamRole(guild,name);
  return role?[...role.members.values()]:[];
}

function teamValue(guild,name){
  const vals=teamMembers(guild,name)
    .map(m=>Number(ensureUser(m).value)||parseNickValue(m));

  return vals.reduce((a,b)=>a+b,0);
}

function ensureTeam(name){
  if(!db.teams[name]){
    db.teams[name]={
      players:[],
      score:0,
      gd:0,
      gf:0,
      ga:0,
      roleId:IDS.teams[name]||null,
      teamValue:0,
      ilk11:{},
      formation:"4-3-3"
    };
  }

  if(!db.teams[name].players)db.teams[name].players=[];
  if(!Number.isFinite(Number(db.teams[name].score)))db.teams[name].score=0;
  if(!Number.isFinite(Number(db.teams[name].gd)))db.teams[name].gd=0;
  if(!Number.isFinite(Number(db.teams[name].gf)))db.teams[name].gf=0;
  if(!Number.isFinite(Number(db.teams[name].ga)))db.teams[name].ga=0;
  if(!db.teams[name].ilk11)db.teams[name].ilk11={};

  return db.teams[name];
}

function addStandingResult(a,b,sa,sb){
  const A=ensureTeam(a);
  const B=ensureTeam(b);

  A.gf+=sa;
  A.ga+=sb;
  A.gd=A.gf-A.ga;

  B.gf+=sb;
  B.ga+=sa;
  B.gd=B.gf-B.ga;

  if(sa>sb){
    A.score+=3;
  }else if(sb>sa){
    B.score+=3;
  }else{
    A.score++;
    B.score++;
  }

  saveData();
}

function teamPlayers(guild,name){
  const t=ensureTeam(name);

  const manual=t.players
    .map(p=>guild.members.cache.get(p.id))
    .filter(Boolean);

  const role=teamMembers(guild,name);

  return [
    ...new Map(
      [...manual,...role].map(m=>[m.id,m])
    ).values()
  ];
}

const FIRST11_POSITIONS=[
  ["GK","Kaleci"],
  ["LB","Sol Bek"],
  ["CB1","Stoper 1"],
  ["CB2","Stoper 2"],
  ["RB","Sağ Bek"],
  ["CM1","Merkez Orta Saha 1"],
  ["CM2","Merkez Orta Saha 2"],
  ["LW","Sol Kanat"],
  ["CAM","10 Numara"],
  ["RW","Sağ Kanat"],
  ["ST","Santrafor"]
];

function getMatchPlayers(guild,teamName){
  const first=ensureTeam(teamName).ilk11||{};

  const ids=FIRST11_POSITIONS
    .map(([key])=>first[key])
    .filter(Boolean);

  if(ids.length===FIRST11_POSITIONS.length){
    const members=ids
      .map(id=>guild.members.cache.get(id))
      .filter(Boolean);

    if(members.length===FIRST11_POSITIONS.length){
      return [
        ...new Map(
          members.map(m=>[m.id,m])
        ).values()
      ];
    }
  }

  return teamPlayers(guild,teamName);
}

function formationCount(f){
  const nums=f.split("-").map(Number);
  return 1+nums.reduce((a,b)=>a+b,0);
}

const formations=[
  "4-4-2",
  "4-3-3",
  "4-2-3-1",
  "3-5-2",
  "3-4-3",
  "4-3-1-2",
  "4-2-2-2",
  "5-3-2"
];

async function registerPanel(message,target,nickname){
  const id=message.id;

  db.registrationPanels[id]={
    userId:target.id,
    nickname:String(nickname).slice(0,32)
  };

  saveData();

  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`register_futbolcu_${id}`)
      .setLabel("⚽ Futbolcu")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_uye_${id}`)
      .setLabel("👤 Üye")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`register_td_${id}`)
      .setLabel("🧑‍💼 Teknik Direktör")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`register_kaleci_${id}`)
      .setLabel("🧤 Kaleci")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`register_cancel_${id}`)
      .setLabel("❌ İptal Et")
      .setStyle(ButtonStyle.Danger)
  );

  await message.reply({
    embeds:[
      embed(
        "📋 Axera League Kayıt",
        `👤 Oyuncu: <@${target.id}>\n🏷️ İsim: **${String(nickname).replace(/[*_`]/g,"")}**\n\nRol seçiniz.`,
        0x5865F2
      )
    ],
    components:[row]
  });
}

async function finishRegister(interaction,type){
  const p=db.registrationPanels[interaction.message.id];

  if(!p){
    return interaction.reply({
      content:"❌ Bu kayıt paneli artık geçerli değil.",
      ephemeral:true
    });
  }

  const member=await interaction.guild.members
    .fetch(p.userId)
    .catch(()=>null);

  if(!member){
    return interaction.reply({
      content:"❌ Oyuncu bulunamadı.",
      ephemeral:true
    });
  }

  const all=[
    IDS.roles.kayitsiz,
    IDS.roles.futbolcu,
    IDS.roles.uye,
    IDS.roles.td,
    IDS.roles.kaleci
  ].filter(Boolean);

  await member.roles
    .remove(all.filter(id=>member.roles.cache.has(id)))
    .catch(()=>{});

  const role={
    futbolcu:IDS.roles.futbolcu,
    uye:IDS.roles.uye,
    td:IDS.roles.td,
    kaleci:IDS.roles.kaleci
  }[type];

  if(role){
    await member.roles.add(role).catch(()=>{});
  }

  const u=ensureUser(member);

  u.name=p.nickname;

  if(!Number.isFinite(Number(u.value))){
    u.value=0;
  }

  saveData();

  if(member.manageable){
    await member.setNickname(p.nickname).catch(()=>{});
  }

  delete db.registrationPanels[interaction.message.id];

  saveData();

  await interaction.update({
    embeds:[
      embed(
        "✅ Kayıt Tamamlandı",
        `👤 <@${member.id}> → **${p.nickname}**\n🎭 Rol: **${
          type==="td"
            ?"Teknik Direktör"
            :type==="uye"
              ?"Üye"
              :type==="kaleci"
                ?"Kaleci"
                :"Futbolcu"
        }**`,
        0x57F287
      )
    ],
    components:[]
  });
}

async function doTraining(message){
  if(!onlyChannel(message,IDS.channels.ant))return;

  const u=ensureUser(message.member);

  if(!db.training[message.author.id]){
    db.training[message.author.id]={
      count:0,
      last:0
    };
  }

  const t=db.training[message.author.id];

  if(t.last && Date.now()-t.last<30000){
    const left=Math.ceil(
      (30000-(Date.now()-t.last))/1000
    );

    return message.reply(
      `⏳ Tekrar antrenman için **${left} saniye** beklemelisin.`
    );
  }

  t.last=Date.now();
  t.count++;

  let text=`🏋️ **Antrenman tamamlandı!**\n📊 İlerleme: **${Math.min(t.count,5)}/5**`;

  if(t.count>=5){
    t.count=0;
    const value=await changePlayerValue(
      message.member,
      3,
      "5/5 Antrenman"
    );

    text+=`\n\n🎉 **5/5 antrenman tamamlandı!**\n💰 Ödül: **+3M€**\n💎 Yeni değer: **${money(value)}**`;
  }

  saveData();

  return message.reply({
    embeds:[embed("🏋️ Antrenman",text,0x57F287)]
  });
}

async function doPenalty(message){
  if(!onlyChannel(message,IDS.channels.pen))return;

  const roll=Math.random();
  let result;

  if(roll<0.5){
    result="⚽ GOL";
  }else if(roll<0.75){
    result="🥅 DİREK";
  }else{
    result="🧤 KALECİ";
  }

  let text=`🎯 Sonuç: **${result}**`;

  if(result==="⚽ GOL"){
    const value=await changePlayerValue(
      message.member,
      5,
      "Penaltı golü"
    );

    text+=`\n💰 **+5M€** kazandın!\n💎 Yeni değer: **${money(value)}**`;
  }

  return message.reply({
    embeds:[embed("🥅 Penaltı",text,0x5865F2)]
  });
}

function first11Text(guild,team){
  const current=ensureTeam(team).ilk11||{};

  return FIRST11_POSITIONS.map(
    ([key,label],i)=>{
      const id=current[key];
      const m=id?
        guild.members.cache.get(id):
        null;

      return `**${i+1}. ${label}** — ${
        m
          ? `<@${id}>`
          : id
            ? `<@${id}>`
            : "—"
      }`;
    }
  ).join("\n");
}

const first11State=new Map();

function canManageFirst11(member,team){
  if(
    isAdmin(member)||
    hasRole(member,[IDS.roles.spiker])
  )return true;

  return hasRole(member,[IDS.roles.td]) &&
    getUserTeams(member.guild,member).includes(team);
}

async function sendFirst11Panel(target,team){
  const guild=target.guild;

  const players=teamPlayers(guild,team);

  if(!players.length){
    return target.reply(
      "❌ Bu takımın Discord takım rolünde oyuncu yok."
    );
  }

  const current=ensureTeam(team).ilk11||{};

  const playerOptions=players
    .slice(0,25)
    .map(m=>({
      label:playerName(m).slice(0,100),
      value:m.id,
      description:Object.values(current).includes(m.id)
        ?"İlk 11'de"
        :"Takım oyuncusu"
    }));

  const posOptions=FIRST11_POSITIONS.map(
    ([key,label])=>({
      label,
      value:key,
      description:current[key]
        ?"Mevcut oyuncu var"
        :"Boş"
    })
  );

  const stateKey=
    `${target.author?.id||target.user?.id}:${team}`;

  first11State.set(
    stateKey,
    {
      team,
      pos:null,
      player:null
    }
  );

  const posMenu=
    new StringSelectMenuBuilder()
      .setCustomId(
        `ilk11_pos_${encodeURIComponent(team)}`
      )
      .setPlaceholder("⚽ Mevki seç")
      .addOptions(posOptions);

  const playerMenu=
    new StringSelectMenuBuilder()
      .setCustomId(
        `ilk11_player_${encodeURIComponent(team)}`
      )
      .setPlaceholder("👤 Oyuncu seç")
      .addOptions(playerOptions);

  const buttons=
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `ilk11_add_${encodeURIComponent(team)}`
        )
        .setLabel("➕ İlk 11'e Ekle / Değiştir")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `ilk11_remove_${encodeURIComponent(team)}`
        )
        .setLabel("➖ Mevkiden Çıkar")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(
          `ilk11_clear_${encodeURIComponent(team)}`
        )
        .setLabel("🗑️ İlk 11'i Temizle")
        .setStyle(ButtonStyle.Secondary)
    );

  return target.reply({
    embeds:[
      embed(
        `⚽ ${team} — İlk 11`,
        `${first11Text(guild,team)}\n\n**Kullanım:** Mevki ve oyuncu seç.\n➕ Ekle/Değiştir ile oyuncuyu o mevkiye koy.\n➖ Mevkiden Çıkar ile seçili mevkiyi boşalt.\n🗑️ Tüm İlk 11'i temizle.`,
        0x5865F2
      )
    ],
    components:[
      new ActionRowBuilder().addComponents(posMenu),
      new ActionRowBuilder().addComponents(playerMenu),
      buttons
    ]
  });
}

async function aiReply(message){
  if(!ai){
    return message.reply(
      "❌ Yapay zekâ sistemi için OPENAI_API_KEY ayarlanmalı."
    );
  }

  try{
    const prompt=String(message.content||"").trim();

    if(
      normalize(prompt).includes("seni kim kurdu")
    ){
      return message.reply("Lynox9380 kurdu.");
    }

    if(
      normalize(prompt).includes("yapay zeka altyapisi")||
      normalize(prompt).includes("yapay zekâ altyapısı")
    ){
      return message.reply("Axera League");
    }

    const response=await ai.responses.create({
      model:"gpt-5.6-luna",
      input:[
        {
          role:"system",
          content:
            "Sen Axera League Discord sunucusunun yapay zekâ asistanısın. Türkçe, kısa ve yardımcı cevaplar ver."
        },
        {
          role:"user",
          content:prompt
        }
      ]
    });

    return message.reply(
      response.output_text?.slice(0,1900)||
      "❌ Yanıt oluşturulamadı."
    );
  }catch(e){
    console.error("AI:",e);
    return message.reply(
      "❌ Yapay zekâ şu anda kullanılamıyor."
    );
  }
}

async function runMatch(message,a,b){
  if(
    !db.teams[a]&&!IDS.teams[a]
  )ensureTeam(a);

  if(
    !db.teams[b]&&!IDS.teams[b]
  )ensureTeam(b);

  const playersA=getMatchPlayers(message.guild,a);
  const playersB=getMatchPlayers(message.guild,b);

  const matchId=
    `${message.guild.id}-${Date.now()}`;

  const match={
    id:matchId,
    guildId:message.guild.id,
    a,
    b,
    sa:0,
    sb:0,
    minute:0,
    startedAt:Date.now(),
    playersA:playersA.map(x=>x.id),
    playersB:playersB.map(x=>x.id)
  };

  db.activeMatches[matchId]=match;
  saveData();

  const start=await message.channel.send({
    embeds:[
      embed(
        "⚽ AXERA LEAGUE — MAÇ BAŞLADI",
        `🏟️ **${a}** 0 - 0 **${b}**\n\n⏱️ 1 oyun dakikası = **3 saniye**\n👥 ${playersA.length} oyuncu vs ${playersB.length} oyuncu`,
        0x5865F2
      )
    ]
  });

  for(let minute=1;minute<=90;minute++){
    await sleep(3000);

    match.minute=minute;

    const chance=Math.random();

    if(chance<0.06){
      const side=Math.random()<0.5?"a":"b";

      if(side==="a"){
        match.sa++;
      }else{
        match.sb++;
      }

      const pool=
        side==="a"
          ?playersA
          :playersB;

      const scorer=
        pool[Math.floor(Math.random()*pool.length)];

      let scorerText=
        scorer
          ? `⚽ **${playerName(scorer)}**`
          :"⚽ Gol";

      if(scorer){
        await changePlayerValue(
          scorer,
          2,
          "Maç golü"
        );
      }

      const ch=client.channels.cache.get(
        IDS.channels.mac
      );

      if(ch){
        await ch.send(
          `⏱️ **${minute}'** — ${scorerText}!\n🏆 **${a} ${match.sa} - ${match.sb} ${b}**`
        ).catch(()=>{});
      }
    }

    if(
      minute%15===0||
      minute===45||
      minute===90
    ){
      await message.channel.send({
        embeds:[
          embed(
            `⏱️ ${minute}. Dakika`,
            `**${a}** ${match.sa} - ${match.sb} **${b}**`,
            0x5865F2
          )
        ]
      }).catch(()=>{});
    }
  }

  addStandingResult(
    a,
    b,
    match.sa,
    match.sb
  );

  const participants=[
    ...new Map(
      [...playersA,...playersB]
        .map(m=>[m.id,m])
    ).values()
  ];

  for(const member of participants){
    await changePlayerValue(
      member,
      5,
      "Maç katılım ödülü"
    );
  }

  db.matchHistory[matchId]={
    ...match,
    finishedAt:Date.now()
  };

  delete db.activeMatches[matchId];

  saveData();

  await message.channel.send({
    embeds:[
      embed(
        "🏁 MAÇ BİTTİ",
        `**${a}** ${match.sa} - ${match.sb} **${b}**\n\n💰 Maça katılan oyunculara **+5M€** verildi.\n📊 Puan durumu güncellendi.`,
        0x57F287
      )
    ]
  });

  await postStandings(message.guild);
}

async function postStandings(guild){
  const channel=client.channels.cache.get(
    IDS.channels.puan
  );

  if(!channel)return;

  const names=[
    ...new Set([
      ...Object.keys(IDS.teams),
      ...Object.keys(db.teams)
    ])
  ];

  const rows=names
    .map(name=>{
      const t=ensureTeam(name);

      return {
        name,
        score:Number(t.score)||0,
        gd:Number(t.gd)||0,
        gf:Number(t.gf)||0
      };
    })
    .sort(
      (a,b)=>
        b.score-a.score||
        b.gd-a.gd||
        b.gf-a.gf
    );

  const text=rows.length
    ?rows.map(
      (x,i)=>
        `**${i+1}. ${x.name}** — **${x.score} P** | AV: **${x.gd}** | GF: **${x.gf}**`
    ).join("\n")
    :"Puan durumu boş.";

  await channel.send({
    embeds:[
      embed(
        "🏆 Axera League — Puan Durumu",
        text,
        0xFEE75C
      )
    ]
  });
}

async function startDueFixtures(){
  const now=Date.now();

  for(const fixture of db.fixtures){
    if(
      fixture.started||
      fixture.timestamp>now
    )continue;

    fixture.started=true;
    saveData();

    const guild=client.guilds.cache.get(
      fixture.guildId
    );

    const channel=client.channels.cache.get(
      IDS.channels.mac
    );

    if(!guild||!channel)continue;

    const fakeMessage={
      guild,
      channel,
      author:client.user,
      member:guild.members.me
    };

    await runMatch(
      fakeMessage,
      fixture.a,
      fixture.b
    ).catch(console.error);
  }

  saveData();
}

async function statusPost(){
  const channel=client.channels.cache.get(
    IDS.channels.durum
  );

  if(!channel)return;

  const messages=await channel.messages
    .fetch({limit:100})
    .catch(()=>null);

  if(messages){
    for(const m of messages.values()){
      if(m.author.id===client.user.id){
        await m.delete().catch(()=>{});
      }
    }
  }

  const uptime=Math.floor(
    process.uptime()/3600
  );

  await channel.send({
    embeds:[
      embed(
        "🟢 Axera League Bot Durumu",
        `**Tüm sistemler sorunsuz çalışıyor.**\n\n⏱️ Aktiflik: **${uptime} saat**\n🤖 Bot: **Online**`,
        0x57F287
      )
    ]
  });
}

const prefix=".";

const commands=new Set([
  "k",
  "kayıtsızver",
  "ara",
  "dver",
  "dsil",
  "ant",
  "antrenman",
  "pen",
  "penaltı",
  "penalti",
  "maç",
  "mac",
  "takımekle",
  "takımkaldır",
  "puanekle",
  "takımdeğer",
  "formasyon",
  "ilk11",
  "puan",
  "fiksturekle",
  "fikstür",
  "fikstur",
  "fiksturcikar",
  "bütçeekle",
  "bütçesil",
  "gönder",
  "sil",
  "embed",
  "kick",
  "ban",
  "mute",
  "unmute",
  "dm",
  "tweet",
  "rolpanel",
  "şart",
  "sart",
  "ticketpanel",
  "yardım",
  "yardim",
  "ai",
  "yapayzeka"
]);

let COMMAND_COUNT=0;
let lastStatusKey="";

client.on("guildMemberAdd",async member=>{
  await member.roles.add(
    IDS.roles.kayitsiz
  ).catch(()=>{});

  ensureUser(member);
  saveData();
});

client.on("interactionCreate",async interaction=>{
  try{
    if(interaction.isButton()){
      if(
        interaction.customId.startsWith("register_")
      ){
        const [,type,id]=interaction.customId.split("_");

        if(type==="cancel"){
          delete db.registrationPanels[id];
          saveData();

          return interaction.update({
            embeds:[
              embed(
                "❌ Kayıt İptal Edildi",
                "Kayıt işlemi iptal edildi.",
                0xED4245
              )
            ],
            components:[]
          });
        }

        const p=db.registrationPanels[id];

        if(
          !p||
          !isAdmin(interaction.member)&&
          !hasRole(
            interaction.member,
            [IDS.roles.kayitYetkilisi]
          )
        ){
          return interaction.reply({
            content:"❌ Bu kayıt panelini kullanma yetkin yok.",
            ephemeral:true
          });
        }

        return finishRegister(
          interaction,
          type
        );
      }

      if(
        interaction.customId.startsWith("ilk11_")
      ){
        const [,action,...rest]=
          interaction.customId.split("_");

        const team=decodeURIComponent(
          rest.join("_")
        );

        if(
          !canManageFirst11(
            interaction.member,
            team
          )
        ){
          return interaction.reply({
            content:"❌ Bu takımın İlk 11'ini düzenleme yetkin yok.",
            ephemeral:true
          });
        }

        const key=
          `${interaction.user.id}:${team}`;

        const state=
          first11State.get(key)||{
            team,
            pos:null,
            player:null
          };

        const t=ensureTeam(team);
        t.ilk11??={};

        if(action==="clear"){
          t.ilk11={};
          saveData();
          first11State.delete(key);

          return interaction.update({
            embeds:[
              embed(
                `⚽ ${team} — İlk 11`,
                `🗑️ İlk 11 temizlendi.\n\n${first11Text(interaction.guild,team)}`,
                0xED4245
              )
            ],
            components:[]
          });
        }

        if(!state.pos){
          return interaction.reply({
            content:"❌ Önce bir mevki seç.",
            ephemeral:true
          });
        }

        if(action==="add"){
          if(!state.player){
            return interaction.reply({
              content:"❌ Önce bir oyuncu seç.",
              ephemeral:true
            });
          }

          const players=teamPlayers(
            interaction.guild,
            team
          ).map(x=>x.id);

          if(!players.includes(state.player)){
            return interaction.reply({
              content:"❌ Bu oyuncu takımın oyuncusu değil.",
              ephemeral:true
            });
          }

          for(const pos of Object.keys(t.ilk11)){
            if(
              t.ilk11[pos]===state.player &&
              pos!==state.pos
            ){
              delete t.ilk11[pos];
            }
          }

          t.ilk11[state.pos]=state.player;

          saveData();
          first11State.delete(key);

          return interaction.update({
            embeds:[
              embed(
                `⚽ ${team} — İlk 11`,
                first11Text(interaction.guild,team),
                0x57F287
              )
            ],
            components:[]
          });
        }

        if(action==="remove"){
          if(!t.ilk11[state.pos]){
            return interaction.reply({
              content:"❌ Bu mevki zaten boş.",
              ephemeral:true
            });
          }

          delete t.ilk11[state.pos];
          saveData();
          first11State.delete(key);

          return interaction.update({
            embeds:[
              embed(
                `⚽ ${team} — İlk 11`,
                first11Text(interaction.guild,team),
                0x57F287
              )
            ],
            components:[]
          });
        }
      }

      if(
        interaction.customId.startsWith("role_")
      ){
        const roleId=
          interaction.customId.split("_")[1];

        const member=interaction.member;

        if(member.roles.cache.has(roleId)){
          await member.roles.remove(roleId);

          return interaction.reply({
            content:"❌ Bildirim rolü kaldırıldı.",
            ephemeral:true
          });
        }

        await member.roles.add(roleId);

        return interaction.reply({
          content:"✅ Bildirim rolü verildi.",
          ephemeral:true
        });
      }

      if(
        interaction.customId==="ticket_create"
      ){
        const guild=interaction.guild;

        const existing=Object.entries(
          db.tickets
        ).find(
          ([,t])=>
            t.open&&
            t.userId===interaction.user.id&&
            t.guildId===guild.id
        );

        if(existing){
          return interaction.reply({
            content:`❌ Zaten açık bir destek talebin var: <#${existing[0]}>`,
            ephemeral:true
          });
        }

        const channel=
          await guild.channels.create({
            name:`ticket-${interaction.user.username}`
              .toLowerCase()
              .replace(/[^a-z0-9-]/g,"")
              .slice(0,80),
            type:ChannelType.GuildText,
            permissionOverwrites:[
              {
                id:guild.id,
                deny:[
                  PermissionFlagsBits.ViewChannel
                ]
              },
              {
                id:interaction.user.id,
                allow:[
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              },
              {
                id:IDS.roles.moderator,
                allow:[
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              }
            ]
          });

        db.tickets[channel.id]={
          guildId:guild.id,
          userId:interaction.user.id,
          open:true,
          lastMessage:Date.now()
        };

        saveData();

        const row=
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("ticket_close")
              .setLabel("🔒 Kapat")
              .setStyle(ButtonStyle.Danger)
          );

        await channel.send({
          content:`<@${interaction.user.id}> <@&${IDS.roles.moderator}>`,
          embeds:[
            embed(
              "🎫 Destek Talebi",
              "Yetkili ekibi birazdan ilgilenecektir.",
              0x5865F2
            )
          ],
          components:[row]
        });

        return interaction.reply({
          content:`✅ Ticket oluşturuldu: <#${channel.id}>`,
          ephemeral:true
        });
      }

      if(
        interaction.customId==="ticket_close"
      ){
        const ticket=db.tickets[
          interaction.channel.id
        ];

        if(
          !ticket||
          !isAdmin(interaction.member)&&
          !hasRole(
            interaction.member,
            [IDS.roles.moderator]
          )
        ){
          return interaction.reply({
            content:"❌ Bu ticketı kapatma yetkin yok.",
            ephemeral:true
          });
        }

        ticket.open=false;
        saveData();

        await interaction.reply(
          "🔒 Ticket kapatılıyor..."
        );

        return setTimeout(
          ()=>interaction.channel.delete().catch(()=>{}),
          1500
        );
      }
    }

    if(interaction.isStringSelectMenu()){
      if(
        interaction.customId.startsWith("ilk11_pos_")||
        interaction.customId.startsWith("ilk11_player_")
      ){
        const [,kind,...rest]=
          interaction.customId.split("_");

        const team=decodeURIComponent(
          rest.join("_")
        );

        if(
          !canManageFirst11(
            interaction.member,
            team
          )
        ){
          return interaction.reply({
            content:"❌ Bu takımın İlk 11'ini düzenleme yetkin yok.",
            ephemeral:true
          });
        }

        const key=
          `${interaction.user.id}:${team}`;

        const state=
          first11State.get(key)||{
            team,
            pos:null,
            player:null
          };

        if(kind==="pos"){
          state.pos=interaction.values[0];
          first11State.set(key,state);

          const label=
            FIRST11_POSITIONS.find(
              x=>x[0]===state.pos
            )?.[1]||state.pos;

          return interaction.reply({
            content:`✅ Mevki seçildi: **${label}**`,
            ephemeral:true
          });
        }

        state.player=interaction.values[0];
        first11State.set(key,state);

        const m=
          await interaction.guild.members
            .fetch(state.player)
            .catch(()=>null);

        return interaction.reply({
          content:`✅ Oyuncu seçildi: **${m?playerName(m):"Oyuncu"}**`,
          ephemeral:true
        });
      }

      if(
        interaction.customId==="formation_select"
      ){
        const [team,f]=
          interaction.values[0].split("||");

        ensureTeam(team).formation=f;
        saveData();

        return interaction.update({
          content:`✅ **${team}** formasyonu **${f}** olarak ayarlandı.`,
          components:[]
        });
      }
    }
  }catch(e){
    console.error("INTERACTION ERROR:",e);

    if(!interaction.replied&&!interaction.deferred){
      await interaction.reply({
        content:"❌ İşlem sırasında hata oluştu.",
        ephemeral:true
      }).catch(()=>{});
    }
  }
});

client.on("messageCreate",async message=>{
  if(message.author.bot)return;

  if(
    message.channel.id===IDS.channels.ai &&
    !message.content.startsWith(prefix)
  ){
    return aiReply(message);
  }

  if(!message.content.startsWith(prefix))return;

  const raw=message.content
    .trim()
    .slice(1);

  const parts=raw.split(/\s+/);
  const cmd=normalize(parts.shift());
  const args=parts;

  if(commands.has(cmd)){
    COMMAND_COUNT++;
  }

  if(cmd==="yardım"||cmd==="yardim"){
    return message.reply({
      embeds:[
        embed(
          "📚 AXERA LEAGUE — KOMUT MERKEZİ",
          `**👤 KAYIT & OYUNCU**
• \`.k @oyuncu isim\` — Oyuncu kayıt panelini açar
• \`.kayıtsızver @oyuncu\` — Oyuncuyu Kayıtsız yapar
• \`.ara oyuncu\` — Oyuncu arar

**💰 DEĞER**
• \`.dver @oyuncu 5M\` — Oyuncu değerine +5M€ ekler
• \`.dsil @oyuncu 5M\` — Oyuncu değerinden 5M€ çıkarır

**🏋️ ANTRENMAN & PENALTI**
• \`.ant\` / \`.antrenman\` — Antrenman yapar
• 5/5 antrenmanda otomatik **+3M€**
• \`.pen\` / \`.penaltı\` — Penaltı kullanır
• Gol olursa otomatik **+5M€**

**⚽ TAKIM SİSTEMİ**
• \`.takımekle @Takım\` — Takımı lige ekler
• \`.takımekle Takım Adı\` — İsimle takım ekler
• \`.takımkaldır @Takım\` — Takımı ligden kaldırır
• \`.puanekle @Takım 3\` — Takıma puan ekler
• \`.takımdeğer @Takım 850M\` — Takım değerini ayarlar
• \`.formasyon @Takım\` — Formasyon belirler
• \`.ilk11 @Takım\` — İlk 11 panelini açar
• \`.puan\` — Puan durumunu gösterir

**🏟️ MAÇ**
• \`.maç @Takım1 @Takım2\` — Maç başlatır
• 3 gerçek saniye = 1 oyun dakikası
• Maç sonunda katılımcılara **+5M€**

**📅 FİKSTÜR**
• \`.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM\`
• \`.fikstür\` — Fikstürü gösterir
• \`.fiksturcikar @Takım1 @Takım2\` — Fikstür siler

**💳 KİŞİSEL BÜTÇE**
• \`.bütçeekle @oyuncu 50M\`
• \`.bütçesil @oyuncu 50M\`
• \`.gönder @oyuncu 50M\`

**🎫 DESTEK**
• \`.ticketpanel\` — Ticket paneli oluşturur
• \`.rolpanel\` — Bildirim rol paneli
• \`.şart\` — Sunucu şartlarını gösterir

**🛡️ YETKİLİ**
• \`.sil miktar\`
• \`.embed Başlık | Açıklama\`
• \`.kick @Oyuncu\`
• \`.ban @Oyuncu\`
• \`.mute @Oyuncu\`
• \`.unmute @Oyuncu\`
• \`.dm @Oyuncu mesaj\`

**🐦 DİĞER**
• \`.tweet mesaj\` — Tweet sistemi
• \`.ai soru\` — Yapay zekâ
• \`.yapayzeka soru\` — Yapay zekâ

ℹ️ Kayıtsız üyeler oyun sistemlerini kullanabilir.`,
          0x5865F2
        )
      ]
    });
  }

  if(cmd==="k"){
    if(
      !onlyChannel(message,IDS.channels.kayit)||
      (
        !isAdmin(message.member)&&
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        )
      )
    )return;

    const target=mentionUser(message);

    if(!target){
      return message.reply(
        "❌ Kullanım: `.k @oyuncu isim`"
      );
    }

    const nickname=message.content
      .trim()
      .replace(
        /^\.k\s+<@!?\d+>\s*/i,
        ""
      )
      .trim();

    if(!nickname){
      return message.reply(
        "❌ İsim yazmalısın. Örnek: `.k @oyuncu TakmaAd`"
      );
    }

    const p=
      await message.channel.send(
        "⏳ Kayıt paneli hazırlanıyor..."
      );

    return registerPanel(
      p,
      target,
      nickname
    );
  }

  if(cmd==="kayıtsızver"){
    if(
      !onlyChannel(message,IDS.channels.kayit)||
      (
        !isAdmin(message.member)&&
        !hasRole(
          message.member,
          [IDS.roles.kayitYetkilisi]
        )
      )
    )return;

    const target=mentionUser(message);

    if(!target){
      return message.reply(
        "❌ Kullanım: `.kayıtsızver @oyuncu`"
      );
    }

    await target.roles.remove([
      IDS.roles.futbolcu,
      IDS.roles.uye,
      IDS.roles.td,
      IDS.roles.kaleci
    ].filter(Boolean)).catch(()=>{});

    await target.roles.add(
      IDS.roles.kayitsiz
    ).catch(()=>{});

    return message.reply(
      `✅ <@${target.id}> Kayıtsız yapıldı.`
    );
  }

  if(cmd==="ara"){
    const q=normalize(args.join(" "));

    if(!q){
      return message.reply(
        "❌ Kullanım: `.ara oyuncu adı`"
      );
    }

    await message.guild.members
      .fetch()
      .catch(()=>{});

    const all=[
      ...message.guild.members.cache.values()
    ].filter(
      m=>
        !m.user.bot&&
        !m.roles.cache.has(IDS.roles.kayitsiz)
    );

    const exact=all.filter(
      m=>normalize(playerName(m))===q
    );

    const close=all.filter(
      m=>
        normalize(playerName(m)).includes(q)||
        q.includes(normalize(playerName(m)))
    );

    const results=[
      ...exact,
      ...close.filter(
        m=>!exact.some(x=>x.id===m.id)
      )
    ].slice(0,10);

    if(!results.length){
      return message.reply(
        "❌ Oyuncu bulunamadı."
      );
    }

    return message.reply({
      embeds:[
        embed(
          "🔎 Oyuncu Arama",
          results.map(
            m=>`• <@${m.id}> — **${playerName(m)}**`
          ).join("\n"),
          0x5865F2
        )
      ]
    });
  }

  if(cmd==="dver"||cmd==="dsil"){
    if(
      !onlyChannel(message,IDS.channels.deger)||
      (
        !isAdmin(message.member)&&
        !hasRole(
          message.member,
          [IDS.roles.deger]
        )
      )
    )return;

    const target=mentionUser(message);

    const amountText=args.find(
      x=>/^[0-9]+(?:\.[0-9]+)?M?€?$/i.test(x)
    );

    const n=amountArg(amountText);

    if(!target||!n){
      return message.reply(
        `❌ Kullanım: \`.${cmd} @Oyuncu 5M\``
      );
    }

    const old=
      Number(ensureUser(target).value)||
      parseNickValue(target);

    const v=await changePlayerValue(
      target,
      cmd==="dver"?n:-n,
      cmd
    );

    return message.reply(
      cmd==="dver"
        ?`✅ **${playerName(target)}** değerine **+${n}M€** eklendi.\n💰 **${money(old)} → ${money(v)}**`
        :`✅ **${playerName(target)}** değerinden **-${n}M€** çıkarıldı.\n💰 **${money(old)} → ${money(v)}**`
    );
  }

  if(cmd==="ant"||cmd==="antrenman"){
    return doTraining(message);
  }

  if(
    cmd==="pen"||
    cmd==="penaltı"||
    cmd==="penalti"
  ){
    return doPenalty(message);
  }

  if(cmd==="ilk11"){
    if(
      !isAdmin(message.member)&&
      !hasRole(
        message.member,
        [IDS.roles.spiker,IDS.roles.td]
      )
    ){
      return message.reply(
        "❌ İlk 11 için yetkin yok."
      );
    }

    const mentioned=
      [...message.mentions.roles.values()][0];

    let team=
      mentioned?.name||
      teamByName(
        args
          .join(" ")
          .replace(/<@&\d+>/g," ")
          .trim()
      );

    const own=getUserTeams(
      message.guild,
      message.member
    );

    if(
      !isAdmin(message.member)&&
      !hasRole(
        message.member,
        [IDS.roles.spiker]
      )
    ){
      if(!own.length){
        return message.reply(
          "❌ Teknik Direktör olarak bir takım rolün yok."
        );
      }

      if(team&&!own.includes(team)){
        return message.reply(
          "❌ Sadece kendi takımının İlk 11'ini düzenleyebilirsin."
        );
      }

      if(!team){
        team=own.length===1?own[0]:null;
      }

      if(!team){
        return message.reply(
          `❌ Birden fazla takımın var: ${own.map(x=>`**${x}**`).join(", ")}. Komutta takım belirt.`
        );
      }
    }

    if(!team){
      return message.reply(
        "❌ Takım belirt: `.ilk11 @Takım`"
      );
    }

    ensureTeam(team).ilk11??={};

    return sendFirst11Panel(
      message,
      team
    );
  }

  if(cmd==="maç"||cmd==="mac"){
    if(
      !onlyChannel(message,IDS.channels.mac)||
      (
        !isAdmin(message.member)&&
        !hasRole(
          message.member,
          [IDS.roles.spiker]
        )
      )
    )return;

    const ms=[
      ...message.mentions.roles.values()
    ].slice(0,2);

    let a=ms[0]?.name;
    let b=ms[1]?.name;

    if(!a||!b){
      const t=args
        .map(teamByName)
        .filter(Boolean);

      a=a||t[0];
      b=b||t[1];
    }

    if(!a||!b||a===b){
      return message.reply(
        "❌ Kullanım: `.maç @Takım1 @Takım2`"
      );
    }

    return runMatch(
      message,
      a,
      b
    );
  }

  if(
    cmd==="takımekle"||
    cmd==="takımkaldır"||
    cmd==="puanekle"||
    cmd==="takımdeğer"
  ){
    if(
      !isAdmin(message.member)&&
      !hasRole(
        message.member,
        [IDS.roles.spiker]
      )
    ){
      return message.reply(
        "❌ Takım yönetimi için yetkin yok."
      );
    }

    const role=[
      ...message.mentions.roles.values()
    ][0];

    const rawTeamName=args
      .filter(
        x=>!/^<@&\d+>$/.test(x)
      )
      .join(" ")
      .trim();

    let name=
      role?.name||
      teamByName(rawTeamName)||
      rawTeamName;

    if(!name){
      return message.reply(
        `❌ Kullanım: \`.${cmd} @Takım\``
      );
    }

    if(cmd==="takımekle"){
      const clean=String(name).trim();

      const existing=teamByName(clean);

      if(
        existing&&
        db.teams[existing]
      ){
        return message.reply(
          `⚠️ **${existing}** zaten lige ekli.`
        );
      }

      const roleId=
        role?.id||
        IDS.teams[clean]||
        null;

      db.teams[clean]={
        players:[],
        score:0,
        gd:0,
        gf:0,
        ga:0,
        roleId,
        teamValue:0,
        ilk11:{},
        formation:"4-3-3"
      };

      saveData();

      return message.reply(
        `✅ **${clean}** lige eklendi${
          roleId
            ?` ve <@&${roleId}> takım rolü bağlandı.`
            :"."
        }`
      );
    }

    const actual=
      teamByName(name)||name;

    if(cmd==="takımkaldır"){
      if(
        !db.teams[actual]&&
        !IDS.teams[actual]
      ){
        return message.reply(
          "❌ Bu takım ligde kayıtlı değil."
        );
      }

      if(IDS.teams[actual]){
        db.teams[actual]={
          players:[],
          score:0,
          gd:0,
          gf:0,
          ga:0,
          roleId:IDS.teams[actual],
          teamValue:0,
          ilk11:{},
          formation:"4-3-3"
        };
      }else{
        delete db.teams[actual];
      }

      saveData();

      return message.reply(
        `✅ **${actual}** ligden kaldırıldı.`
      );
    }

    if(cmd==="puanekle"){
      const n=Number(args.at(-1));

      if(!Number.isFinite(n)||n<=0){
        return message.reply(
          "❌ Puan miktarı belirt."
        );
      }

      ensureTeam(actual).score+=n;
      saveData();

      return message.reply(
        `✅ **${actual}** takımına **+${n} puan** eklendi.`
      );
    }

    if(cmd==="takımdeğer"){
      const n=amountArg(args.at(-1));

      if(!n){
        return message.reply(
          "❌ Değer belirt. Örnek: `.takımdeğer @Takım 850M`."
        );
      }

      ensureTeam(actual).teamValue=n;
      saveData();

      return message.reply(
        `✅ **${actual}** takım değeri: **${money(n)}**`
      );
    }
  }

  if(cmd==="formasyon"){
    if(
      !isAdmin(message.member)&&
      !hasRole(
        message.member,
        [IDS.roles.spiker]
      )
    ){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const team=
      teamByName(args.join(" "))||
      [...message.mentions.roles.values()][0]?.name;

    if(!team){
      return message.reply(
        "❌ Takım belirt."
      );
    }

    const menu=
      new StringSelectMenuBuilder()
        .setCustomId("formation_select")
        .setPlaceholder("Formasyon seç");

    menu.addOptions(
      formations.map(
        f=>({
          label:f,
          value:`${team}||${f}`,
          description:`${formationCount(f)} oyunculu sistem`
        })
      )
    );

    return message.reply({
      content:`⚽ **${team}** için formasyon:`,
      components:[
        new ActionRowBuilder().addComponents(menu)
      ]
    });
  }

  if(cmd==="puan"){
    return postStandings(
      message.guild
    );
  }

  if(cmd==="fiksturekle"){
    if(
      !isAdmin(message.member)&&
      !hasRole(
        message.member,
        [IDS.roles.spiker]
      )
    ){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const mentions=[
      ...message.mentions.roles.values()
    ];

    let a=mentions[0]?.name;
    let b=mentions[1]?.name;

    const tm=args
      .filter(x=>teamByName(x))
      .map(teamByName);

    a=a||tm[0];
    b=b||tm[1];

    const date=args.find(
      x=>/^\d{4}-\d{2}-\d{2}$/.test(x)
    );

    const time=args.find(
      x=>/^\d{2}:\d{2}$/.test(x)
    );

    if(!a||!b||!date||!time){
      return message.reply(
        "❌ Kullanım: `.fiksturekle @Takım1 @Takım2 YYYY-MM-DD HH:MM`"
      );
    }

    const timestamp=
      new Date(
        `${date}T${time}:00+03:00`
      ).getTime();

    if(!Number.isFinite(timestamp)){
      return message.reply(
        "❌ Tarih geçersiz."
      );
    }

    db.fixtures.push({
      id:db.nextFixtureId++,
      guildId:message.guild.id,
      a,
      b,
      date,
      time,
      timestamp,
      started:false
    });

    saveData();

    return message.reply(
      `✅ **${a} - ${b}** fikstüre eklendi: **${date} ${time}**`
    );
  }

  if(
    cmd==="fikstür"||
    cmd==="fikstur"
  ){
    const list=db.fixtures
      .filter(
        f=>
          f.guildId===message.guild.id&&
          !f.started
      )
      .slice(0,20);

    return message.reply({
      embeds:[
        embed(
          "📅 Axera League Fikstür",
          list.length
            ?list.map(
              f=>`• **${f.a} - ${f.b}** — ${f.date} ${f.time}`
            ).join("\n")
            :"Fikstür boş.",
          0x5865F2
        )
      ]
    });
  }

  if(cmd==="fiksturcikar"){
    if(
      !isAdmin(message.member)&&
      !hasRole(
        message.member,
        [IDS.roles.spiker]
      )
    ){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const t=args
      .filter(x=>teamByName(x))
      .map(teamByName);

    if(t.length<2){
      return message.reply(
        "❌ İki takım belirt."
      );
    }

    const i=db.fixtures.findIndex(
      f=>
        f.guildId===message.guild.id&&
        !f.started&&
        f.a===t[0]&&
        f.b===t[1]
    );

    if(i<0){
      return message.reply(
        "❌ Fikstür bulunamadı."
      );
    }

    db.fixtures.splice(i,1);
    saveData();

    return message.reply(
      "✅ Fikstür silindi."
    );
  }

  if(
    cmd==="bütçeekle"||
    cmd==="bütçesil"
  ){
    if(
      !isAdmin(message.member)&&
      !hasRole(
        message.member,
        [IDS.roles.deger]
      )
    ){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const target=mentionUser(message);
    const n=amountArg(args[1]);

    if(!target||!n){
      return message.reply(
        `❌ Kullanım: \`.${cmd} @oyuncu 5M\``
      );
    }

    const u=ensureUser(target);

    u.budget=Math.max(
      0,
      u.budget+
      (
        cmd==="bütçeekle"
          ?n
          :-n
      )
    );

    saveData();

    return message.reply(
      `💳 **${playerName(target)}** kişisel bütçesi: **${money(u.budget)}**`
    );
  }

  if(cmd==="gönder"){
    const target=mentionUser(message);
    const n=amountArg(args[1]);

    if(!target||!n){
      return message.reply(
        "❌ Kullanım: `.gönder @oyuncu 5M`"
      );
    }

    if(target.id===message.author.id){
      return message.reply(
        "❌ Kendine gönderemezsin."
      );
    }

    const sender=ensureUser(
      message.member
    );

    const receiver=ensureUser(
      target
    );

    if(sender.budget<n){
      return message.reply(
        "❌ Yeterli bütçen yok."
      );
    }

    sender.budget-=n;
    receiver.budget+=n;

    saveData();

    return message.reply(
      `✅ **${money(n)}** <@${target.id}> oyuncusuna gönderildi.`
    );
  }

  if(cmd==="sil"){
    if(!isAdmin(message.member)){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const n=Math.min(
      Number(args[0]||0),
      1000
    );

    if(!n){
      return message.reply(
        "❌ Miktar belirt."
      );
    }

    const deleted=
      await message.channel
        .bulkDelete(n,true)
        .catch(()=>null);

    const m=
      await message.channel.send(
        `🧹 **${deleted?.size||0}** mesaj silindi.`
      );

    setTimeout(
      ()=>m.delete().catch(()=>{}),
      2500
    );

    return;
  }

  if(cmd==="embed"){
    if(!isAdmin(message.member)){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const [title,desc]=
      raw
        .slice(cmd.length)
        .trim()
        .split("|")
        .map(x=>x?.trim());

    if(!title||!desc){
      return message.reply(
        "❌ Kullanım: `.embed Başlık | Açıklama`"
      );
    }

    return message.channel.send({
      embeds:[
        embed(
          title,
          desc,
          0x5865F2
        )
      ]
    });
  }

  if(
    ["kick","ban","mute","unmute"]
      .includes(cmd)
  ){
    if(!isAdmin(message.member)){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const target=
      message.mentions.members.first();

    if(!target){
      return message.reply(
        "❌ Oyuncu belirt."
      );
    }

    if(cmd==="kick"){
      await target
        .kick("Axera League")
        .catch(()=>{});
    }

    if(cmd==="ban"){
      await target
        .ban({
          reason:"Axera League"
        })
        .catch(()=>{});
    }

    if(cmd==="mute"){
      await target
        .timeout(
          28*24*60*60*1000,
          "Axera League"
        )
        .catch(()=>{});
    }

    if(cmd==="unmute"){
      await target
        .timeout(
          null,
          "Axera League"
        )
        .catch(()=>{});
    }

    return message.reply(
      `✅ İşlem tamamlandı: **${cmd}**`
    );
  }

  if(cmd==="dm"){
    if(!isAdmin(message.member)){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const target=
      message.mentions.members.first();

    const text=args
      .slice(1)
      .join(" ");

    if(!target||!text){
      return message.reply(
        "❌ Kullanım: `.dm @Oyuncu mesaj`"
      );
    }

    await target
      .send(text)
      .catch(()=>null);

    return message.reply(
      "✅ DM gönderildi."
    );
  }

  if(cmd==="tweet"){
    if(
      !onlyChannel(
        message,
        IDS.channels.tweet
      )
    )return;

    const text=args.join(" ");

    if(!text){
      return message.reply(
        "❌ Tweet metni yaz."
      );
    }

    await message.delete()
      .catch(()=>{});

    const last=
      db.tweetCooldowns[
        message.author.id
      ]||0;

    let reward="";

    if(
      Date.now()-last>=86400000
    ){
      db.tweetCooldowns[
        message.author.id
      ]=Date.now();

      await changePlayerValue(
        message.member,
        5,
        "Tweet ödülü"
      );

      reward="\n💰 **+5M€** ödül kazandın!";
    }

    saveData();

    return message.channel.send({
      embeds:[
        embed(
          "🐦 Tweet",
          `${text}${reward}\n\n— **${playerName(message.member)}**`,
          0x5865F2
        )
      ]
    });
  }

  if(cmd==="rolpanel"){
    if(!isAdmin(message.member)){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const roles=[
      [IDS.roles.partner,"🤝 Partner Ping"],
      [IDS.roles.macPing,"⚽ Maç Ping"],
      [IDS.roles.duyuru,"📢 Duyuru Ping"],
      [IDS.roles.cekilis,"🎁 Çekiliş Ping"],
      [IDS.roles.medya,"🎥 Medya Ping"]
    ];

    const row=
      new ActionRowBuilder().addComponents(
        roles.map(
          ([id,label])=>
            new ButtonBuilder()
              .setCustomId(`role_${id}`)
              .setLabel(label)
              .setStyle(ButtonStyle.Secondary)
        )
      );

    return message.channel.send({
      embeds:[
        embed(
          "🎭 Rol Paneli",
          "İstediğin bildirim rollerini butonlardan açıp kapatabilirsin.",
          0x5865F2
        )
      ],
      components:[row]
    });
  }

  if(
    cmd==="şart"||
    cmd==="sart"
  ){
    return message.reply({
      embeds:[
        embed(
          "📌 Axera League Şartları",
          "✓ Kalıcı Tık: Kalıcı 「✓」 kanalına tıklayınız.\n🎭 Rol Al: Rol Al kanalından en az 2 rol alınız.\n\nℹ️ Bu şartlar zorunlu değildir; sistemler kullanılabilir.",
          0x5865F2
        )
      ]
    });
  }

  if(cmd==="ticketpanel"){
    if(!isAdmin(message.member)){
      return message.reply(
        "❌ Yetkin yok."
      );
    }

    const row=
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_create")
          .setLabel("🎫 Destek Talebi Oluştur")
          .setStyle(ButtonStyle.Primary)
      );

    return message.channel.send({
      embeds:[
        embed(
          "🎫 Axera League Destek",
          "Yardıma ihtiyacın varsa aşağıdaki butona bas.",
          0x5865F2
        )
      ],
      components:[row]
    });
  }

  if(
    cmd==="ai"||
    cmd==="yapayzeka"
  ){
    const q=args.join(" ");

    if(!q){
      return message.reply(
        "❌ Soru yaz."
      );
    }

    return aiReply({
      ...message,
      content:q,
      reply:message.reply.bind(message)
    });
  }
});

client.on("messageCreate",message=>{
  if(message.author.bot)return;

  const t=
    db.tickets[
      message.channel.id
    ];

  if(t&&t.open){
    t.lastMessage=Date.now();
    saveData();
  }
});

setInterval(async()=>{
  await startDueFixtures()
    .catch(console.error);

  for(
    const [id,t]
    of Object.entries(db.tickets)
  ){
    if(
      t.open&&
      Date.now()-t.lastMessage>3600000
    ){
      t.open=false;
      saveData();

      const ch=
        client.channels.cache.get(id);

      if(ch){
        await ch.delete()
          .catch(()=>{});
      }
    }
  }

  const d=new Date();

  const key=
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;

  if(
    (d.getMinutes()===0||
     d.getMinutes()===30)&&
    key!==lastStatusKey
  ){
    lastStatusKey=key;

    await statusPost()
      .catch(console.error);
  }
},1000);

client.once("ready",()=>{
  console.log(
    `Axera League aktif: ${client.user.tag}`
  );

  client.user.setPresence({
    activities:[
      {
        name:"Axera League",
        type:1,
        url:
          process.env.STREAM_URL||
          "https://www.twitch.tv/axeraleague"
      }
    ],
    status:"online"
  });

  console.log(
    `Sunucu sayısı: ${client.guilds.cache.size}`
  );
});

process.on(
  "unhandledRejection",
  e=>console.error("UNHANDLED:",e)
);

process.on(
  "uncaughtException",
  e=>console.error("UNCAUGHT:",e)
);

client.login(TOKEN);
