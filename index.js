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

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

/* =========================
   Slash Commands
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
        ),

    new SlashCommandBuilder()
        .setName("role-delete")
        .setDescription("指定した文字列を含むロールを一括削除")
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
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

/* =========================
   コマンド登録
========================= */

async function registerGuildCommands(guild) {
    try {
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
            `コマンド登録完了 : ${guild.name} (${guild.id})`
        );

    } catch (error) {
        console.error(
            `コマンド登録失敗 : ${guild.name}`,
            error.message
        );
    }
}

/* =========================
   Ready
========================= */

client.once(Events.ClientReady, async () => {
    console.log(`ログイン完了 : ${client.user.tag}`);

    for (const guild of client.guilds.cache.values()) {
        await registerGuildCommands(guild);
    }

    console.log(
        `登録対象Server : ${client.guilds.cache.size}`
    );
});

/* =========================
   新しいServerに参加
========================= */

client.on(Events.GuildCreate, async guild => {
    console.log(
        `新しいServerに参加 : ${guild.name} (${guild.id})`
    );

    await registerGuildCommands(guild);
});

/* =========================
   Slash Commands
========================= */

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    /* =====================
       チャンネル削除
    ===================== */

    if (interaction.commandName === "delete-name") {

        if (
            !interaction.memberPermissions?.has(
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
            interaction.options
                .getString("keyword")
                .toLowerCase();

        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content:
                    "❌ Server内で実行してください。",
                ephemeral: true
            });
        }

        const targets =
            guild.channels.cache.filter(channel =>
                channel.type === ChannelType.GuildText &&
                channel.name.toLowerCase().includes(keyword)
            );

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
                        `channel_delete_confirm:${interaction.user.id}`
                    )
                    .setLabel("削除する")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId(
                        `channel_delete_cancel:${interaction.user.id}`
                    )
                    .setLabel("キャンセル")
                    .setStyle(ButtonStyle.Secondary)
            );

        return interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    }

    /* =====================
       ロール削除
    ===================== */

    if (interaction.commandName === "role-delete") {

        if (
            !interaction.memberPermissions?.has(
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
            interaction.options
                .getString("keyword")
                .toLowerCase();

        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content:
                    "❌ Server内で実行してください。",
                ephemeral: true
            });
        }

        let botMember;

        try {
            botMember =
                await guild.members.fetchMe();
        } catch (error) {
            console.error(
                "Bot Member取得失敗:",
                error
            );

            return interaction.reply({
                content:
                    "❌ BotのServer情報を取得できませんでした。",
                ephemeral: true
            });
        }

        const botRole =
            botMember.roles.highest;

        /*
         * Botより下のロールだけ対象
         *
         * @everyone
         * Bot以上のロール
         * は削除しない
         */

        const targets =
            guild.roles.cache.filter(role =>
                role.id !== guild.id &&
                role.position < botRole.position &&
                role.name.toLowerCase().includes(keyword)
            );

        if (targets.size === 0) {
            return interaction.reply({
                content:
                    `🔎 「${keyword}」を含み、Botが削除できるロールはありません。`,
                ephemeral: true
            });
        }

        const names =
            [...targets.values()]
                .sort((a, b) =>
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

        const embed = new EmbedBuilder()
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
                    value: `${targets.size}ロール`,
                    inline: true
                },
                {
                    name: "Botの最高ロール",
                    value: `${botRole.name}`,
                    inline: true
                }
            )
            .setFooter({
                text:
                    "Botより上位のロールは削除されません"
            });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `role_delete_confirm:${interaction.user.id}`
                    )
                    .setLabel("削除する")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId(
                        `role_delete_cancel:${interaction.user.id}`
                    )
                    .setLabel("キャンセル")
                    .setStyle(ButtonStyle.Secondary)
            );

        return interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    }
});

/* =========================
   Buttons
========================= */

client.on(Events.InteractionCreate, async interaction => {

    if (!interaction.isButton()) {
        return;
    }

    const [action, ownerId] =
        interaction.customId.split(":");

    /*
     * 実行した本人以外は押せない
     */

    if (ownerId !== interaction.user.id) {
        return interaction.reply({
            content:
                "❌ この確認ボタンを操作できるのは実行した本人だけです。",
            ephemeral: true
        });
    }

    /* =====================
       Channel Cancel
    ===================== */

    if (action === "channel_delete_cancel") {
        return interaction.update({
            content:
                "❌ キャンセルしました。",
            embeds: [],
            components: []
        });
    }

    /* =====================
       Channel Confirm
    ===================== */

    if (action === "channel_delete_confirm") {

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

        const guild =
            interaction.guild;

        if (!guild) {
            return interaction.update({
                content:
                    "❌ Server情報を取得できませんでした。",
                embeds: [],
                components: []
            });
        }

        const targets =
            guild.channels.cache.filter(channel =>
                channel.type === ChannelType.GuildText &&
                channel.name.toLowerCase().includes(keyword)
            );

        if (targets.size === 0) {
            return interaction.update({
                content:
                    "ℹ️ 削除対象のチャンネルはありません。",
                embeds: [],
                components: []
            });
        }

        /*
         * 確認画面を削除
         */

        await interaction.update({
            content: "🗑️ チャンネルの削除を開始しました。",
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

        /*
         * Server全員に見える結果
         */

        return interaction.followUp({
            content:
                `✅ **チャンネル一括削除完了**\n\n` +
                `🗑️ 削除: **${success}**\n` +
                `❌ 失敗: **${failed}**`
        });
    }

    /* =====================
       Role Cancel
    ===================== */

    if (action === "role_delete_cancel") {
        return interaction.update({
            content:
                "❌ キャンセルしました。",
            embeds: [],
            components: []
        });
    }

    /* =====================
       Role Confirm
    ===================== */

    if (action === "role_delete_confirm") {

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

        const guild =
            interaction.guild;

        if (!guild) {
            return interaction.update({
                content:
                    "❌ Server情報を取得できませんでした。",
                embeds: [],
                components: []
            });
        }

        let botMember;

        try {

            botMember =
                await guild.members.fetchMe();

        } catch (error) {

            console.error(
                "Bot Member取得失敗:",
                error
            );

            return interaction.update({
                content:
                    "❌ Bot情報を取得できませんでした。",
                embeds: [],
                components: []
            });
        }

        const botRole =
            botMember.roles.highest;

        const targets =
            guild.roles.cache.filter(role =>
                role.id !== guild.id &&
                role.position < botRole.position &&
                role.name.toLowerCase().includes(keyword)
            );

        if (targets.size === 0) {
            return interaction.update({
                content:
                    "ℹ️ 削除対象のロールはありません。",
                embeds: [],
                components: []
            });
        }

        /*
         * 確認画面を更新
         * → Server全員に見える通常メッセージ
         */

        await interaction.update({
            content:
                `🗑️ **${targets.size}個のロールを削除しています……**`,
            embeds: [],
            components: []
        });

        let success = 0;
        let failed = 0;

        /*
         * 上位ロールから順番に削除
         */

        for (
            const role of
            [...targets.values()]
                .sort(
                    (a, b) =>
                        b.position - a.position
                )
        ) {

            try {

                /*
                 * 削除直前にもBotより下か確認
                 */

                if (
                    role.position >=
                    botRole.position
                ) {
                    failed++;
                    continue;
                }

                await role.delete(
                    `ロール一括削除: "${keyword}"`
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

        /*
         * Server全員に見える結果
         */

        return interaction.followUp({
            content:
                `✅ **ロール一括削除完了**\n\n` +
                `🗑️ 削除: **${success}**\n` +
                `❌ 失敗: **${failed}**`
        });
    }
});

/* =========================
   Error Handling
========================= */

client.on(Events.Error, error => {
    console.error(
        "Discord Client Error:",
        error
    );
});

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "Unhandled Rejection:",
            error
        );
    }
);

/* =========================
   Environment Check
========================= */

if (!TOKEN || !CLIENT_ID) {

    console.error(
        "DISCORD_TOKEN / CLIENT_ID が設定されていません。"
    );

    process.exit(1);
}

/* =========================
   Login
========================= */

client.login(TOKEN);
