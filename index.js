const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Events
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const commands = [
    new SlashCommandBuilder()
        .setName("delete-name")
        .setDescription("名前に指定した文字列を含むテキストチャンネルを一括削除")
        .addStringOption(option =>
            option
                .setName("keyword")
                .setDescription("チャンネル名に含まれる文字列")
                .setRequired(true)
                .setMaxLength(100)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageChannels.toString()
        )
        .toJSON()
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once(Events.ClientReady, async () => {
    console.log(`ログイン完了: ${client.user.tag}`);

    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            {
                body: commands
            }
        );

        console.log("スラッシュコマンド登録完了");
    } catch (error) {
        console.error("コマンド登録エラー:", error);
    }
});

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName !== "delete-name") {
        return;
    }

    if (!interaction.memberPermissions.has(
        PermissionFlagsBits.ManageChannels
    )) {
        return interaction.reply({
            content: "❌ このコマンドを使うには「チャンネルの管理」権限が必要です。",
            ephemeral: true
        });
    }

    const keyword = interaction.options.getString("keyword");
    const search = keyword.toLowerCase();

    const targets = interaction.guild.channels.cache.filter(channel => {
        return (
            channel.type === ChannelType.GuildText &&
            channel.name.toLowerCase().includes(search)
        );
    });

    if (targets.size === 0) {
        return interaction.reply({
            content:
                `🔎 「${keyword}」を含むテキストチャンネルはありません。`,
            ephemeral: true
        });
    }

    const names = [...targets.values()]
        .slice(0, 50)
        .map(channel => `• ${channel.name} (\`${channel.id}\`)`)
        .join("\n");

    const more =
        targets.size > 50
            ? `\n\n…その他 ${targets.size - 50} チャンネル`
            : "";

    const embed = new EmbedBuilder()
        .setTitle("⚠️ チャンネル一括削除")
        .setDescription(
            `以下のチャンネルを削除します。\n\n${names}${more}`
        )
        .addFields(
            {
                name: "検索文字列",
                value: `\`${keyword}\``,
                inline: true
            },
            {
                name: "対象数",
                value: `${targets.size} チャンネル`,
                inline: true
            }
        )
        .setFooter({
            text: "この操作は元に戻せません"
        });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("delete_confirm")
                .setLabel("削除する")
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId("delete_cancel")
                .setLabel("キャンセル")
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
});

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isButton()) {
        return;
    }

    if (interaction.customId === "delete_cancel") {

        return interaction.update({
            content: "❌ キャンセルしました。",
            embeds: [],
            components: []
        });
    }

    if (interaction.customId !== "delete_confirm") {
        return;
    }

    if (!interaction.memberPermissions.has(
        PermissionFlagsBits.ManageChannels
    )) {
        return interaction.update({
            content: "❌ チャンネル管理権限がありません。",
            embeds: [],
            components: []
        });
    }

    const embed = interaction.message.embeds[0];

    if (!embed) {
        return interaction.update({
            content: "❌ 対象情報を取得できませんでした。",
            embeds: [],
            components: []
        });
    }

    const field = embed.fields.find(
        field => field.name === "検索文字列"
    );

    if (!field) {
        return interaction.update({
            content: "❌ 検索条件を取得できませんでした。",
            embeds: [],
            components: []
        });
    }

    const keyword = field.value
        .replace(/^`|`$/g, "")
        .toLowerCase();

    const targets = interaction.guild.channels.cache.filter(channel => {
        return (
            channel.type === ChannelType.GuildText &&
            channel.name.toLowerCase().includes(keyword)
        );
    });

    if (targets.size === 0) {
        return interaction.update({
            content: "ℹ️ 削除対象のチャンネルはありません。",
            embeds: [],
            components: []
        });
    }

    await interaction.update({
        content:
            `🗑️ ${targets.size}個のチャンネルを削除しています……`,
        embeds: [],
        components: []
    });

    let success = 0;
    let failed = 0;

    for (const channel of targets.values()) {

        try {

            await channel.delete(
                `一括削除: "${keyword}"`
            );

            success++;

            await new Promise(resolve =>
                setTimeout(resolve, 300)
            );

        } catch (error) {

            failed++;

            console.error(
                `削除失敗: ${channel.name}`,
                error.message
            );
        }
    }

    await interaction.followUp({
        content:
            `✅ 一括削除完了\n\n` +
            `🗑️ 削除: **${success}**\n` +
            `❌ 失敗: **${failed}**`,
        ephemeral: true
    });
});

client.on(Events.Error, error => {
    console.error("Discord Client Error:", error);
});

process.on("unhandledRejection", error => {
    console.error("Unhandled Rejection:", error);
});

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {

    console.error(
        "DISCORD_TOKEN / CLIENT_ID / GUILD_ID が設定されていません。"
    );

    process.exit(1);
}

client.login(TOKEN);
