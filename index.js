const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField
} = require("discord.js");

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

// Axera League Yönetici rolü
const YONETICI_ROLE_ID = "1534456315366342716";

function isAdmin(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.roles.cache.has(YONETICI_ROLE_ID)
  );
}

client.once("ready", () => {
  console.log(`Axera League bot aktif: ${client.user.tag}`);
  client.user.setActivity("Axera League | Futbol RP");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // ================================
  // KANALLARI SİL
  // ================================
  if (command === "kanallarisil") {
    if (!isAdmin(message.member)) {
      return message.reply("❌ Bu komutu yalnızca **Yönetici** kullanabilir.");
    }

    if (
      !message.guild.members.me.permissions.has(
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply(
        "❌ Botun kanalları silmek için **Kanalları Yönet** yetkisine sahip olması gerekiyor."
      );
    }

    const confirm = await message.reply(
      "⚠️ **DİKKAT:** Bu komut sunucudaki **tüm kanalları silecektir.**\n\n" +
      "Roller ve üyeler silinmez.\n" +
      "Devam etmek için **`onayla`** yaz."
    );

    const filter = (m) =>
      m.author.id === message.author.id &&
      m.channel.id === message.channel.id &&
      m.content.toLowerCase() === "onayla";

    const collector = message.channel.createMessageCollector({
      filter,
      time: 15000,
      max: 1
    });

    collector.on("collect", async () => {
      await confirm.edit("🗑️ Kanallar siliniyor...");

      const channels = [...message.guild.channels.cache.values()];

      let deleted = 0;
      let failed = 0;

      for (const channel of channels) {
        try {
          await channel.delete("Axera League kanal sıfırlama komutu");
          deleted++;
        } catch (error) {
          failed++;
          console.error(
            `Kanal silinemedi: ${channel.name} (${channel.id})`,
            error
          );
        }
      }

      // Kanallar silindiği için mesaj gönderilemeyebilir.
      console.log(
        `Axera League kanal sıfırlama tamamlandı. Silinen: ${deleted}, Başarısız: ${failed}`
      );
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        try {
          await confirm.edit("⌛ İşlem iptal edildi.");
        } catch {}
      }
    });
  }
});

if (!process.env.TOKEN) {
  console.error("❌ TOKEN bulunamadı! Railway Variables kısmına TOKEN ekleyin.");
  process.exit(1);
}

client.login(process.env.TOKEN);
