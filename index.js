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

if (!TOKEN || !CLIENT_ID) {
    console.error("DISCORD_TOKEN / CLIENT_ID が設定されていません。");
    process.exit(1);
}

/* =========================
   Client
========================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

/* =========================
   Slash Commands
========================= */

const commands = [

    new SlashCommandBuilder()
        .setName("delete-name")
        .setDescription("名前に指定文字列を含むテキストチャンネルを一括削除")
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

    new SlashCommandBuilder()
        .setName("delete-roles")
        .setDescription("名前に指定文字列を含むロールを一括削除")
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

/* =========================
   Slash Command Registration
   全Server対応
========================= */

const rest = new REST({
    version: "10"
}).setToken(TOKEN);

client.once(Events.ClientReady, async () => {

    console.log("");
    console.log("================================");
    console.log(`ログイン完了 : ${client.user.tag}`);
    console.log(`参加Server数 : ${client.guilds.cache.size}`);
    console.log("================================");

    try {

        /*
         * Botが参加している全Serverへ
         * Slash Commandを登録
         */

        for (const guild of client.guilds.cache.values()) {

            console.log(
                `Server : ${guild.name} (${guild.id})`
            );

            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    guild.id
                ),
                {
                    body: commands
                }
            );

        }

        console.log("スラッシュコマンド登録完了");

    } catch (error) {

        console.error(
            "コマンド登録エラー:",
            error
        );

    }

});

/* =========================
   Chat Input
========================= */

client.on(
    Events.InteractionCreate,
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        /* =========================
           delete-name
        ========================= */

        if (interaction.commandName === "delete-name") {

            if (!interaction.guild) {

                return interaction.reply({
                    content:
                        "❌ Server内で実行してください。"
                });

            }

            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageChannels
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ 「チャンネルの管理」権限が必要です。",
                    ephemeral: true
                });

            }

            const keyword =
                interaction.options
                    .getString("keyword", true)
                    .toLowerCase();

            const guild = interaction.guild;

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

                return interaction.reply({
                    content:
                        `🔎 「${keyword}」を含むテキストチャンネルはありません。`
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
                    ? `\n\n…その他 ${targets.size - 50}チャンネル`
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
                            value: `${targets.size}チャンネル`,
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            "この操作は元に戻せません"
                    });

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `delete_name_confirm_${interaction.user.id}`
                            )
                            .setLabel("削除する")
                            .setStyle(
                                ButtonStyle.Danger
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `delete_name_cancel_${interaction.user.id}`
                            )
                            .setLabel("キャンセル")
                            .setStyle(
                                ButtonStyle.Secondary
                            )

                    );

            return interaction.reply({
                embeds: [embed],
                components: [row]
            });

        }

        /* =========================
           delete-roles
        ========================= */

        if (interaction.commandName === "delete-roles") {

            if (!interaction.guild) {

                return interaction.reply({
                    content:
                        "❌ Server内で実行してください。"
                });

            }

            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ 「ロールの管理」権限が必要です。",
                    ephemeral: true
                });

            }

            const guild = interaction.guild;

            const me = guild.members.me;

            if (!me) {

                return interaction.reply({
                    content:
                        "❌ Bot自身のメンバー情報を取得できませんでした。"
                });

            }

            const botHighestRole =
                me.roles.highest;

            const keyword =
                interaction.options
                    .getString("keyword", true)
                    .toLowerCase();

            /*
             * 名前にkeywordを含むロールだけ
             *
             * @everyone
             * 管理ロール
             * Bot以上のロール
             *
             * は除外
             */

            const targets =
                guild.roles.cache.filter(role => {

                    return (
                        role.id !== guild.id &&
                        !role.managed &&
                        role.position <
                            botHighestRole.position &&
                        role.name
                            .toLowerCase()
                            .includes(keyword)
                    );

                });

            if (targets.size === 0) {

                return interaction.reply({
                    content:
                        `🔎 「${keyword}」を含む削除可能なロールはありません。`
                });

            }

            const names =
                [...targets.values()]
                    .sort(
                        (a, b) =>
                            b.position - a.position
                    )
                    .slice(0, 50)
                    .map(role =>
                        `• ${role.name} (\`${role.id}\`)`
                    )
                    .join("\n");

            const more =
                targets.size > 50
                    ? `\n\n…その他 ${targets.size - 50}ロール`
                    : "";

            const embed =
                new EmbedBuilder()
                    .setTitle("⚠️ ロール一括削除")
                    .setDescription(
                        `名前に「${keyword}」を含む` +
                        `削除可能なロールを削除します。\n\n` +
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
                            value: `${targets.size}ロール`,
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            "管理ロール・統合ロール・Botより上のロールは削除されません"
                    });

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `delete_roles_confirm_${interaction.user.id}`
                            )
                            .setLabel("ロールを削除")
                            .setStyle(
                                ButtonStyle.Danger
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `delete_roles_cancel_${interaction.user.id}`
                            )
                            .setLabel("キャンセル")
                            .setStyle(
                                ButtonStyle.Secondary
                            )

                    );

            return interaction.reply({
                embeds: [embed],
                components: [row]
            });

        }

    }
);

/* =========================
   Button
========================= */

client.on(
    Events.InteractionCreate,
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }

        const id =
            interaction.customId;

        /* =========================
           Channel Cancel
        ========================= */

        if (
            id.startsWith(
                "delete_name_cancel_"
            )
        ) {

            const ownerId =
                id.replace(
                    "delete_name_cancel_",
                    ""
                );

            if (
                interaction.user.id !== ownerId
            ) {

                return interaction.reply({
                    content:
                        "❌ この操作を実行した本人だけ操作できます。",
                    ephemeral: true
                });

            }

            return interaction.update({
                content:
                    "❌ キャンセルしました。",
                embeds: [],
                components: []
            });

        }

        /* =========================
           Channel Confirm
        ========================= */

        if (
            id.startsWith(
                "delete_name_confirm_"
            )
        ) {

            const ownerId =
                id.replace(
                    "delete_name_confirm_",
                    ""
                );

            if (
                interaction.user.id !== ownerId
            ) {

                return interaction.reply({
                    content:
                        "❌ この操作を実行した本人だけ操作できます。",
                    ephemeral: true
                });

            }

            if (!interaction.guild) {

                return interaction.update({
                    content:
                        "❌ Serverを取得できませんでした。",
                    embeds: [],
                    components: []
                });

            }

            if (
                !interaction.memberPermissions?.has(
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
                        field.name ===
                        "検索文字列"
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

            const guild =
                interaction.guild;

            const targets =
                guild.channels.cache.filter(
                    channel =>
                        channel.type ===
                            ChannelType.GuildText &&
                        channel.name
                            .toLowerCase()
                            .includes(keyword)
                );

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

            for (
                const channel
                of targets.values()
            ) {

                try {

                    await channel.delete(
                        `一括削除 : "${keyword}" / 実行者 : ${interaction.user.tag}`
                    );

                    success++;

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                300
                            )
                    );

                } catch (error) {

                    failed++;

                    console.error(
                        `チャンネル削除失敗 : ${channel.name}`,
                        error.message
                    );

                }

            }

            return interaction.followUp({
                content:
                    `✅ 一括削除完了\n\n` +
                    `🗑️ 削除 : **${success}**\n` +
                    `❌ 失敗 : **${failed}**`
            });

        }

        /* =========================
           Role Cancel
        ========================= */

        if (
            id.startsWith(
                "delete_roles_cancel_"
            )
        ) {

            const ownerId =
                id.replace(
                    "delete_roles_cancel_",
                    ""
                );

            if (
                interaction.user.id !== ownerId
            ) {

                return interaction.reply({
                    content:
                        "❌ この操作を実行した本人だけ操作できます。",
                    ephemeral: true
                });

            }

            return interaction.update({
                content:
                    "❌ キャンセルしました。",
                embeds: [],
                components: []
            });

        }

        /* =========================
           Role Confirm
        ========================= */

        if (
            id.startsWith(
                "delete_roles_confirm_"
            )
        ) {

            const ownerId =
                id.replace(
                    "delete_roles_confirm_",
                    ""
                );

            if (
                interaction.user.id !== ownerId
            ) {

                return interaction.reply({
                    content:
                        "❌ この操作を実行した本人だけ操作できます。",
                    ephemeral: true
                });

            }

            if (!interaction.guild) {

                return interaction.update({
                    content:
                        "❌ Serverを取得できませんでした。",
                    embeds: [],
                    components: []
                });

            }

            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {

                return interaction.update({
                    content:
                        "❌ ロール管理権限がありません。",
                    embeds: [],
                    components: []
                });

            }

            const guild =
                interaction.guild;

            const me =
                guild.members.me;

            if (!me) {

                return interaction.update({
                    content:
                        "❌ Bot自身の情報を取得できませんでした。",
                    embeds: [],
                    components: []
                });

            }

            const botHighestRole =
                me.roles.highest;

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
                        field.name ===
                        "検索文字列"
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

            /*
             * 確認時にも再検索。
             * 実行前に追加されたロールなども
             * 正しく判定する。
             */

            const targets =
                guild.roles.cache.filter(role => {

                    return (
                        role.id !== guild.id &&
                        !role.managed &&
                        role.position <
                            botHighestRole.position &&
                        role.name
                            .toLowerCase()
                            .includes(keyword)
                    );

                });

            if (targets.size === 0) {

                return interaction.update({
                    content:
                        "ℹ️ 削除できる対象ロールがありません。",
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

            for (
                const role
                of targets.values()
            ) {

                try {

                    await role.delete(
                        `ロール一括削除 : "${keyword}" / 実行者 : ${interaction.user.tag}`
                    );

                    success++;

                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                500
                            )
                    );

                } catch (error) {

                    failed++;

                    console.error(
                        `ロール削除失敗 : ${role.name}`,
                        error.message
                    );

                }

            }

            return interaction.followUp({
                content:
                    `✅ ロール削除完了\n\n` +
                    `🔎 検索 : \`${keyword}\`\n` +
                    `🗑️ 削除 : **${success}**\n` +
                    `❌ 失敗 : **${failed}**`
            });

        }

    }
);

/* =========================
   Error
========================= */

client.on(
    Events.Error,
    error => {
        console.error(
            "Discord Client Error:",
            error
        );
    }
);

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

/* =========================
   Login
========================= */

client.login(TOKEN);
