require("dotenv").config();

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

/* =========================
   スラッシュコマンド
========================= */

const commands = [

    // チャンネル削除
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
        .toJSON(),

    // ロール削除
    new SlashCommandBuilder()
        .setName("role-delete")
        .setDescription("名前に指定した文字列を含むロールを一括削除")
        .addStringOption(option =>
            option
                .setName("keyword")
                .setDescription("ロール名に含まれる文字列")
                .setRequired(true)
                .setMaxLength(100)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageRoles.toString()
        )
        .toJSON()

];

const rest = new REST({ version: "10" }).setToken(TOKEN);

/* =========================
   起動
========================= */

client.once(Events.ClientReady, async () => {

    console.log(`ログイン完了 : ${client.user.tag}`);

    try {

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            {
                body: commands
            }
        );

        console.log("スラッシュコマンド登録完了");

    } catch (error) {

        console.error("コマンド登録エラー :", error);

    }
});

/* =========================
   チャンネル削除コマンド
========================= */

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName !== "delete-name") {
        return;
    }

    if (
        !interaction.memberPermissions.has(
            PermissionFlagsBits.ManageChannels
        )
    ) {
        return interaction.reply({
            content:
                "❌ このコマンドを使うには「チャンネルの管理」権限が必要です。",
            ephemeral: true
        });
    }

    const keyword =
        interaction.options.getString("keyword");

    const search =
        keyword.toLowerCase();

    try {

        const guild =
            await client.guilds.fetch(interaction.guildId);

        await guild.channels.fetch();

        const targets =
            guild.channels.cache.filter(channel => {

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

        const names =
            [...targets.values()]
                .slice(0, 50)
                .map(channel =>
                    `• ${channel.name} (\`${channel.id}\`)`
                )
                .join("\n");

        const more =
            targets.size > 50
                ? `\n\n…その他 ${targets.size - 50} チャンネル`
                : "";

        const embed =
            new EmbedBuilder()
                .setTitle("⚠️ チャンネル一括削除")
                .setDescription(
                    `以下のチャンネルを削除します。\n\n` +
                    `${names}${more}`
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

        const row =
            new ActionRowBuilder()
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

    } catch (error) {

        console.error("チャンネル検索エラー:", error);

        if (!interaction.replied) {

            await interaction.reply({
                content:
                    "❌ チャンネル情報を取得できませんでした。",
                ephemeral: true
            });

        }

    }

});

/* =========================
   ロール削除コマンド
========================= */

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName !== "role-delete") {
        return;
    }

    if (
        !interaction.memberPermissions.has(
            PermissionFlagsBits.ManageRoles
        )
    ) {
        return interaction.reply({
            content:
                "❌ このコマンドを使うには「ロールの管理」権限が必要です。",
            ephemeral: true
        });
    }

    const keyword =
        interaction.options.getString("keyword");

    const search =
        keyword.toLowerCase();

    try {

        const guild =
            await client.guilds.fetch(interaction.guildId);

        await guild.roles.fetch();

        const me =
            await guild.members.fetchMe();

        if (!me) {

            return interaction.reply({
                content:
                    "❌ Bot自身の情報を取得できませんでした。",
                ephemeral: true
            });

        }

        const botRole =
            me.roles.highest;

        const targets =
            guild.roles.cache.filter(role => {

                // @everyoneは除外
                if (role.id === guild.id) {
                    return false;
                }

                // 連携ロールなどは除外
                if (role.managed) {
                    return false;
                }

                // Bot自身以上のロールは除外
                if (role.position >= botRole.position) {
                    return false;
                }

                // 名前にキーワードが含まれるものだけ
                return role.name
                    .toLowerCase()
                    .includes(search);

            });

        if (targets.size === 0) {

            return interaction.reply({
                content:
                    `🔎 「${keyword}」を含み、Botより下にある削除可能なロールはありません。`,
                ephemeral: true
            });

        }

        const names =
            [...targets.values()]
                .sort((a, b) => b.position - a.position)
                .slice(0, 50)
                .map(role =>
                    `• ${role.name} (\`${role.id}\`)`
                )
                .join("\n");

        const more =
            targets.size > 50
                ? `\n\n…その他 ${targets.size - 50} ロール`
                : "";

        const embed =
            new EmbedBuilder()
                .setTitle("⚠️ ロール一括削除")
                .setDescription(
                    `以下のロールを削除します。\n\n` +
                    `${names}${more}`
                )
                .addFields(
                    {
                        name: "検索文字列",
                        value: `\`${keyword}\``,
                        inline: true
                    },
                    {
                        name: "対象数",
                        value: `${targets.size} ロール`,
                        inline: true
                    },
                    {
                        name: "Botの最高位",
                        value: botRole.name,
                        inline: true
                    }
                )
                .setFooter({
                    text: "Botより上のロール・@everyone・連携ロールは対象外です"
                });

        const row =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId("role_delete_confirm")
                        .setLabel("ロールを削除する")
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId("role_delete_cancel")
                        .setLabel("キャンセル")
                        .setStyle(ButtonStyle.Secondary)

                );

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

    } catch (error) {

        console.error("ロール検索エラー:", error);

        if (!interaction.replied) {

            await interaction.reply({
                content:
                    "❌ ロール情報を取得できませんでした。",
                ephemeral: true
            });

        }

    }

});

/* =========================
   ボタン処理
========================= */

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isButton()) {
        return;
    }

    /* -------------------------
       チャンネル削除キャンセル
    ------------------------- */

    if (interaction.customId === "delete_cancel") {

        return interaction.update({
            content: "❌ キャンセルしました。",
            embeds: [],
            components: []
        });

    }

    /* -------------------------
       チャンネル削除確認
    ------------------------- */

    if (interaction.customId === "delete_confirm") {

        if (
            !interaction.memberPermissions.has(
                PermissionFlagsBits.ManageChannels
            )
        ) {
            return interaction.update({
                content:
                    "❌ チャンネル管理権限がありません。",
                embeds: [],
                components: []
            });
        }

        const embed =
            interaction.message.embeds[0];

        if (!embed) {

            return interaction.update({
                content:
                    "❌ 対象情報を取得できませんでした。",
                embeds: [],
                components: []
            });

        }

        const field =
            embed.fields.find(
                field =>
                    field.name === "検索文字列"
            );

        if (!field) {

            return interaction.update({
                content:
                    "❌ 検索条件を取得できませんでした。",
                embeds: [],
                components: []
            });

        }

        const keyword =
            field.value
                .replace(/^`|`$/g, "")
                .toLowerCase();

        try {

            const guild =
                await client.guilds.fetch(
                    interaction.guildId
                );

            await guild.channels.fetch();

            const targets =
                guild.channels.cache.filter(channel => {

                    return (
                        channel.type === ChannelType.GuildText &&
                        channel.name
                            .toLowerCase()
                            .includes(keyword)
                    );

                });

            if (targets.size === 0) {

                return interaction.update({
                    content:
                        "ℹ️ 削除対象のチャンネルはありません。",
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

        } catch (error) {

            console.error(
                "チャンネル削除エラー:",
                error
            );

            await interaction.followUp({
                content:
                    "❌ チャンネル削除中にエラーが発生しました。",
                ephemeral: true
            });

        }

        return;
    }

    /* -------------------------
       ロール削除キャンセル
    ------------------------- */

    if (interaction.customId === "role_delete_cancel") {

        return interaction.update({
            content: "❌ ロール削除をキャンセルしました。",
            embeds: [],
            components: []
        });

    }

    /* -------------------------
       ロール削除確認
    ------------------------- */

    if (
        interaction.customId === "role_delete_confirm"
    ) {

        if (
            !interaction.memberPermissions.has(
                PermissionFlagsBits.ManageRoles
            )
        ) {
            return interaction.update({
                content:
                    "❌ ロールの管理権限がありません。",
                embeds: [],
                components: []
            });
        }

        const embed =
            interaction.message.embeds[0];

        if (!embed) {

            return interaction.update({
                content:
                    "❌ 対象情報を取得できませんでした。",
                embeds: [],
                components: []
            });

        }

        const field =
            embed.fields.find(
                field =>
                    field.name === "検索文字列"
            );

        if (!field) {

            return interaction.update({
                content:
                    "❌ 検索条件を取得できませんでした。",
                embeds: [],
                components: []
            });

        }

        const keyword =
            field.value
                .replace(/^`|`$/g, "")
                .toLowerCase();

        try {

            const guild =
                await client.guilds.fetch(
                    interaction.guildId
                );

            await guild.roles.fetch();

            const me =
                await guild.members.fetchMe();

            const botRole =
                me.roles.highest;

            const targets =
                guild.roles.cache.filter(role => {

                    if (role.id === guild.id) {
                        return false;
                    }

                    if (role.managed) {
                        return false;
                    }

                    if (role.position >= botRole.position) {
                        return false;
                    }

                    return role.name
                        .toLowerCase()
                        .includes(keyword);

                });

            if (targets.size === 0) {

                return interaction.update({
                    content:
                        "ℹ️ 削除対象のロールはありません。",
                    embeds: [],
                    components: []
                });

            }

            await interaction.update({
                content:
                    `🗑️ ${targets.size}個のロールを削除しています……`,
                embeds: [],
                components: []
            });

            let success = 0;
            let failed = 0;

            for (const role of targets.values()) {

                try {

                    // 削除直前にもBotより下か確認
                    if (
                        role.position >=
                        botRole.position
                    ) {
                        failed++;
                        continue;
                    }

                    await role.delete(
                        `一括削除: "${keyword}"`
                    );

                    success++;

                    await new Promise(resolve =>
                        setTimeout(resolve, 300)
                    );

                } catch (error) {

                    failed++;

                    console.error(
                        `ロール削除失敗: ${role.name}`,
                        error.message
                    );

                }

            }

            await interaction.followUp({
                content:
                    `✅ ロール一括削除完了\n\n` +
                    `🗑️ 削除: **${success}**\n` +
                    `❌ 失敗: **${failed}**`,
                ephemeral: true
            });

        } catch (error) {

            console.error(
                "ロール削除エラー:",
                error
            );

            await interaction.followUp({
                content:
                    "❌ ロール削除中にエラーが発生しました。",
                ephemeral: true
            });

        }

    }

});

/* =========================
   エラー処理
========================= */

client.on(Events.Error, error => {

    console.error(
        "Discord Client Error:",
        error
    );

});

process.on("unhandledRejection", error => {

    console.error(
        "Unhandled Rejection:",
        error
    );

});

/* =========================
   環境変数チェック
========================= */

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {

    console.error(
        "DISCORD_TOKEN / CLIENT_ID / GUILD_ID が設定されていません。"
    );

    process.exit(1);

}

/* =========================
   ログイン
========================= */

client.login(TOKEN);
