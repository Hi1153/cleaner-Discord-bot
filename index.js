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

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

/* =========================
   コマンド
========================= */

const commands = [

    new SlashCommandBuilder()
        .setName("delete-name")
        .setDescription("指定した文字列を含むテキストチャンネルを一括削除")
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
        .setDescription("Botより下にある荒らし用ロールを一括削除")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageRoles.toString()
        )
        .toJSON()

];

/* =========================
   ログイン
========================= */

client.once(Events.ClientReady, async () => {

    console.log(`ログイン完了 : ${client.user.tag}`);
    console.log(`Bot ID : ${client.user.id}`);
    console.log(`参加Server数 : ${client.guilds.cache.size}`);

    /*
     * 複数Server対応
     * グローバル登録ではなく、Botが現在参加している
     * 全Serverへコマンドを登録する
     */

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    for (const [guildId, guild] of client.guilds.cache) {

        try {

            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    guildId
                ),
                {
                    body: commands
                }
            );

            console.log(
                `コマンド登録完了 : ${guild.name} (${guildId})`
            );

        } catch (error) {

            console.error(
                `コマンド登録失敗 : ${guild.name}`,
                error.message
            );

        }

    }

});

/* =========================
   新しいServerへ参加した時
========================= */

client.on(Events.GuildCreate, async guild => {

    try {

        const rest = new REST({ version: "10" }).setToken(TOKEN);

        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                guild.id
            ),
            {
                body: commands
            }
        );

        console.log(
            `新規Serverへコマンド登録 : ${guild.name}`
        );

    } catch (error) {

        console.error(
            "新規Server コマンド登録失敗 :",
            error.message
        );

    }

});

/* =========================
   スラッシュコマンド
========================= */

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    /* =========================
       delete-name
    ========================= */

    if (interaction.commandName === "delete-name") {

        if (!interaction.guild) {

            return interaction.reply({
                content: "❌ Server内で実行してください。",
                ephemeral: true
            });

        }

        if (!interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageChannels
        )) {

            return interaction.reply({
                content: "❌ 「チャンネルの管理」権限が必要です。",
                ephemeral: true
            });

        }

        const keyword =
            interaction.options
                .getString("keyword", true)
                .toLowerCase();

        const guild = interaction.guild;

        const targets = guild.channels.cache.filter(channel => {

            return (
                channel.type === ChannelType.GuildText &&
                channel.name.toLowerCase().includes(keyword)
            );

        });

        if (targets.size === 0) {

            return interaction.reply({
                content:
                    `🔎 「${keyword}」を含むチャンネルはありません。`,
                ephemeral: true
            });

        }

        const names = [...targets.values()]
            .slice(0, 50)
            .map(channel =>
                `• ${channel.name} (\`${channel.id}\`)`
            )
            .join("\n");

        const more =
            targets.size > 50
                ? `\n\n…その他 ${targets.size - 50}チャンネル`
                : "";

        const embed = new EmbedBuilder()
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
                text: "この操作は元に戻せません"
            });

        const row = new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `delete_name_confirm_${interaction.user.id}`
                    )
                    .setLabel("削除する")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId(
                        `delete_name_cancel_${interaction.user.id}`
                    )
                    .setLabel("キャンセル")
                    .setStyle(ButtonStyle.Secondary)

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
                content: "❌ Server内で実行してください。",
                ephemeral: true
            });

        }

        if (!interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageRoles
        )) {

            return interaction.reply({
                content: "❌ 「ロールの管理」権限が必要です。",
                ephemeral: true
            });

        }

        const guild = interaction.guild;

        /*
         * Bot自身のMember情報を確実に取得
         */

        let me;

        try {

            me = await guild.members.fetchMe();

        } catch (error) {

            console.error(
                "Bot Member取得失敗 :",
                error.message
            );

            return interaction.reply({
                content:
                    "❌ Bot自身のメンバー情報を取得できませんでした。",
                ephemeral: true
            });

        }

        const botHighestRole = me.roles.highest;

        /*
         * Botより下
         * 管理ロールではない
         * @everyoneではない
         *
         * ロールだけを対象にする
         */

        const targets = guild.roles.cache.filter(role => {

            return (
                role.id !== guild.id &&
                !role.managed &&
                role.position < botHighestRole.position
            );

        });

        if (targets.size === 0) {

            return interaction.reply({
                content:
                    "ℹ️ Botより下に削除可能なロールがありません。",
                ephemeral: true
            });

        }

        const names = [...targets.values()]
            .slice(0, 50)
            .map(role =>
                `• ${role.name} (\`${role.id}\`)`
            )
            .join("\n");

        const more =
            targets.size > 50
                ? `\n\n…その他 ${targets.size - 50}ロール`
                : "";

        const embed = new EmbedBuilder()
            .setTitle("⚠️ ロール一括削除")
            .setDescription(
                `Botより下にある削除可能なロールを削除します。\n\n` +
                `${names}${more}`
            )
            .addFields({
                name: "対象数",
                value: `${targets.size}ロール`,
                inline: true
            })
            .setFooter({
                text:
                    "管理ロール・統合ロール・Botより上のロールは削除されません"
            });

        const row = new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `delete_roles_confirm_${interaction.user.id}`
                    )
                    .setLabel("ロールを削除")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId(
                        `delete_roles_cancel_${interaction.user.id}`
                    )
                    .setLabel("キャンセル")
                    .setStyle(ButtonStyle.Secondary)

            );

        return interaction.reply({
            embeds: [embed],
            components: [row]
        });

    }

});

/* =========================
   ボタン処理
========================= */

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isButton()) {
        return;
    }

    const id = interaction.customId;

    /* =========================
       チャンネル削除キャンセル
    ========================= */

    if (id.startsWith("delete_name_cancel_")) {

        const ownerId =
            id.replace("delete_name_cancel_", "");

        if (interaction.user.id !== ownerId) {

            return interaction.reply({
                content:
                    "❌ この操作を実行した本人だけ操作できます。",
                ephemeral: true
            });

        }

        return interaction.update({
            content: "❌ キャンセルしました。",
            embeds: [],
            components: []
        });

    }

    /* =========================
       チャンネル削除確認
    ========================= */

    if (id.startsWith("delete_name_confirm_")) {

        const ownerId =
            id.replace("delete_name_confirm_", "");

        if (interaction.user.id !== ownerId) {

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

        if (!interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageChannels
        )) {

            return interaction.update({
                content:
                    "❌ チャンネル管理権限がありません。",
                embeds: [],
                components: []
            });

        }

        const embed = interaction.message.embeds[0];

        if (!embed) {

            return interaction.update({
                content:
                    "❌ 対象情報を取得できませんでした。",
                embeds: [],
                components: []
            });

        }

        const field = embed.fields.find(
            field => field.name === "検索文字列"
        );

        if (!field) {

            return interaction.update({
                content:
                    "❌ 検索条件を取得できませんでした。",
                embeds: [],
                components: []
            });

        }

        const keyword = field.value
            .replace(/^`|`$/g, "")
            .toLowerCase();

        const guild = interaction.guild;

        const targets = guild.channels.cache.filter(channel => {

            return (
                channel.type === ChannelType.GuildText &&
                channel.name.toLowerCase().includes(keyword)
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

        /*
         * ここで即座にDiscordへ応答
         * 「アプリケーションが応答しない」を防ぐ
         */

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
                    `一括削除 : "${keyword}" / 実行者 : ${interaction.user.tag}`
                );

                success++;

                await new Promise(resolve =>
                    setTimeout(resolve, 350)
                );

            } catch (error) {

                failed++;

                console.error(
                    `チャンネル削除失敗 : ${channel.name}`,
                    error.message
                );

            }

        }

        /*
         * 実行者だけではなく
         * Server全員に見える結果メッセージ
         */

        return interaction.followUp({
            content:
                `✅ **チャンネル一括削除完了**\n\n` +
                `🗑️ 削除 : **${success}**\n` +
                `❌ 失敗 : **${failed}**`
        });

    }

    /* =========================
       ロール削除キャンセル
    ========================= */

    if (id.startsWith("delete_roles_cancel_")) {

        const ownerId =
            id.replace("delete_roles_cancel_", "");

        if (interaction.user.id !== ownerId) {

            return interaction.reply({
                content:
                    "❌ この操作を実行した本人だけ操作できます。",
                ephemeral: true
            });

        }

        return interaction.update({
            content: "❌ キャンセルしました。",
            embeds: [],
            components: []
        });

    }

    /* =========================
       ロール削除確認
    ========================= */

    if (id.startsWith("delete_roles_confirm_")) {

        const ownerId =
            id.replace("delete_roles_confirm_", "");

        if (interaction.user.id !== ownerId) {

            return interaction.reply({
                content:
                    "❌ この操作を実行した本人だけ操作できます。",
                ephemeral: true
            });

        }

        if (!interaction.guild) {

            return interaction.reply({
                content:
                    "❌ Server内で実行してください。",
                ephemeral: true
            });

        }

        if (!interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageRoles
        )) {

            return interaction.reply({
                content:
                    "❌ ロール管理権限がありません。",
                ephemeral: true
            });

        }

        /*
         * 最初に即応答
         * ロール取得や削除に時間がかかっても
         * 「アプリケーションが応答しない」にならない
         */

        await interaction.deferUpdate();

        const guild = interaction.guild;

        let me;

        try {

            me = await guild.members.fetchMe();

        } catch (error) {

            console.error(
                "Bot Member取得失敗 :",
                error.message
            );

            return interaction.editReply({
                content:
                    "❌ Bot自身のメンバー情報を取得できませんでした。",
                embeds: [],
                components: []
            });

        }

        const botHighestRole = me.roles.highest;

        /*
         * 荒らしが作った通常ロールを対象
         *
         * @everyone       → 除外
         * Bot管理ロール   → 除外
         * 統合ロール      → 除外
         * Bot以上のロール → 除外
         */

        const targets = guild.roles.cache.filter(role => {

            return (
                role.id !== guild.id &&
                !role.managed &&
                role.position < botHighestRole.position
            );

        });

        if (targets.size === 0) {

            return interaction.editReply({
                content:
                    "ℹ️ 削除できるロールがありません。",
                embeds: [],
                components: []
            });

        }

        await interaction.editReply({
            content:
                `🗑️ ${targets.size}個のロールを削除しています……`,
            embeds: [],
            components: []
        });

        let success = 0;
        let failed = 0;

        for (const role of targets.values()) {

            try {

                await role.delete(
                    `荒らし対策によるロール一括削除 / 実行者 : ${interaction.user.tag}`
                );

                success++;

                await new Promise(resolve =>
                    setTimeout(resolve, 500)
                );

            } catch (error) {

                failed++;

                console.error(
                    `ロール削除失敗 : ${role.name}`,
                    error.message
                );

            }

        }

        /*
         * Server全員に見える完了メッセージ
         */

        return interaction.followUp({
            content:
                `✅ **ロール削除完了**\n\n` +
                `🗑️ 削除 : **${success}**\n` +
                `❌ 失敗 : **${failed}**`
        });

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

process.on("uncaughtException", error => {

    console.error(
        "Uncaught Exception:",
        error
    );

});

/* =========================
   Login
========================= */

client.login(TOKEN);
EOF

# 必要パッケージ確認・不足ならインストール
npm install discord.js dotenv

# 構文チェック
node --check index.js

# Botだけ再起動
pm2 restart cleaner-discord-bot

# 状態確認
pm2 status cleaner-discord-bot
