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

const pendingActions = new Map();

function createTargetList(items, formatter, unit) {
    const lines = [];
    let length = 0;

    for (const item of items) {
        const line = `• ${formatter(item)}\n`;

        // Embedのdescription上限に余裕を残す。
        if (length + line.length > 3400) {
            break;
        }

        lines.push(line);
        length += line.length;
    }

    const more =
        items.length > lines.length
            ? `\n…その他 ${items.length - lines.length}${unit}`
            : "";

    return {
        text: lines.join("") + more,
        shown: lines.length
    };
}

/* =========================
   Slash Commands
========================= */

const commands = [

    new SlashCommandBuilder()
        .setName("delete-name")
        .setDescription("名前に指定文字列を含むテキストチャンネルを一括削除")
        .addStringOption(option =>
            option
                .setName("select")
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
                .setName("select")
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

async function registerGuildCommands(guild) {
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

            await registerGuildCommands(guild);

        }

        console.log("スラッシュコマンド登録完了");

    } catch (error) {

        console.error(
            "コマンド登録エラー:",
            error
        );

    }

});

client.on(Events.GuildCreate, async guild => {
    try {
        await registerGuildCommands(guild);
        console.log(`新しいServerへコマンドを登録 : ${guild.name}`);
    } catch (error) {
        console.error(
            `新しいServerへのコマンド登録エラー : ${guild.name}`,
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

            const channelBotMember =
                await interaction.guild.members
                    .fetchMe()
                    .catch(() => null);

            if (
                !channelBotMember ||
                !channelBotMember.permissions.has(
                    PermissionFlagsBits.ManageChannels
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Botに「チャンネルの管理」権限がありません。",
                    ephemeral: true
                });
            }

            const select =
                interaction.options
                    .getString("select", true)
                    .trim()
                    .toLowerCase();

            if (!select) {
                return interaction.reply({
                    content:
                        "❌ selectには空白以外の文字列を指定してください。",
                    ephemeral: true
                });
            }

            const guild = interaction.guild;

            const targets =
                guild.channels.cache.filter(channel => {

                    return (
                        channel.type === ChannelType.GuildText &&
                        channel.name
                            .toLowerCase()
                            .includes(select)
                    );

                });

            if (targets.size === 0) {

                return interaction.reply({
                    content:
                        `🔎 「${select}」を含むテキストチャンネルはありません。`
                });

            }

            const targetList = createTargetList(
                [...targets.values()],
                channel => `${channel.name} (\`${channel.id}\`)`,
                "チャンネル"
            );

            const actionId = interaction.id;
            pendingActions.set(actionId, {
                type: "channels",
                userId: interaction.user.id,
                guildId: guild.id,
                select,
                targetIds: [...targets.keys()]
            });

            const timer = setTimeout(
                () => pendingActions.delete(actionId),
                10 * 60 * 1000
            );
            timer.unref?.();

            const embed =
                new EmbedBuilder()
                    .setTitle("⚠️ チャンネル一括削除")
                    .setDescription(
                        `以下のチャンネルを削除します。\n\n` +
                        `${targetList.text}`
                    )
                    .addFields(
                        {
                            name: "検索文字列",
                            value: `\`${select}\``,
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
                                `delete_name_confirm_${actionId}`
                            )
                            .setLabel("削除する")
                            .setStyle(
                                ButtonStyle.Danger
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `delete_name_cancel_${actionId}`
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

            const me =
                await guild.members.fetchMe()
                    .catch(() => null);

            if (!me) {

                return interaction.reply({
                    content:
                        "❌ Bot自身のメンバー情報を取得できませんでした。"
                });

            }

            if (
                !me.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return interaction.reply({
                    content:
                        "❌ Botに「ロールの管理」権限がありません。",
                    ephemeral: true
                });
            }

            const actor =
                await guild.members.fetch(interaction.user.id)
                    .catch(() => null);

            if (!actor) {
                return interaction.reply({
                    content:
                        "❌ 実行者のメンバー情報を取得できませんでした。",
                    ephemeral: true
                });
            }

            const botHighestRole =
                me.roles.highest;

            const actorHighestRole =
                actor.roles.highest;

            const select =
                interaction.options
                    .getString("select", true)
                    .trim()
                    .toLowerCase();

            if (!select) {
                return interaction.reply({
                    content:
                        "❌ selectには空白以外の文字列を指定してください。",
                    ephemeral: true
                });
            }

            /*
             * 名前にselectを含むロールだけ
             *
             * @everyone
             * 管理ロール
             * Botまたは実行者以上のロール
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
                        role.position <
                            actorHighestRole.position &&
                        role.name
                            .toLowerCase()
                            .includes(select)
                    );

                });

            if (targets.size === 0) {

                return interaction.reply({
                    content:
                        `🔎 「${select}」を含む削除可能なロールはありません。`
                });

            }

            const sortedTargets =
                [...targets.values()]
                    .sort(
                        (a, b) =>
                            b.position - a.position
                    );

            const targetList = createTargetList(
                sortedTargets,
                role => `${role.name} (\`${role.id}\`)`,
                "ロール"
            );

            const actionId = interaction.id;
            pendingActions.set(actionId, {
                type: "roles",
                userId: interaction.user.id,
                guildId: guild.id,
                select,
                targetIds: sortedTargets.map(role => role.id)
            });

            const timer = setTimeout(
                () => pendingActions.delete(actionId),
                10 * 60 * 1000
            );
            timer.unref?.();

            const embed =
                new EmbedBuilder()
                    .setTitle("⚠️ ロール一括削除")
                    .setDescription(
                        `名前に「${select}」を含む` +
                        `削除可能なロールを削除します。\n\n` +
                        `${targetList.text}`
                    )
                    .addFields(
                        {
                            name: "検索文字列",
                            value: `\`${select}\``,
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
                            "管理ロール・統合ロール・Botまたは実行者より上のロールは削除されません"
                    });

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `delete_roles_confirm_${actionId}`
                            )
                            .setLabel("ロールを削除")
                            .setStyle(
                                ButtonStyle.Danger
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `delete_roles_cancel_${actionId}`
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

            const actionId =
                id.replace(
                    "delete_name_cancel_",
                    ""
                );

            const pending =
                pendingActions.get(actionId);

            if (!pending) {
                return interaction.reply({
                    content:
                        "❌ この操作は期限切れです。もう一度実行してください。",
                    ephemeral: true
                });
            }

            if (
                interaction.user.id !== pending.userId
            ) {

                return interaction.reply({
                    content:
                        "❌ この操作を実行した本人だけ操作できます。",
                    ephemeral: true
                });

            }

            pendingActions.delete(actionId);

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

            const actionId =
                id.replace(
                    "delete_name_confirm_",
                    ""
                );

            const pending =
                pendingActions.get(actionId);

            if (!pending) {
                return interaction.reply({
                    content:
                        "❌ この操作は期限切れです。もう一度実行してください。",
                    ephemeral: true
                });
            }

            if (
                interaction.user.id !== pending.userId
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

            const guild =
                interaction.guild;

            if (
                pending.guildId !== guild.id ||
                pending.type !== "channels"
            ) {
                pendingActions.delete(actionId);
                return interaction.update({
                    content:
                        "❌ 操作情報が正しくありません。",
                    embeds: [],
                    components: []
                });
            }

            const botMember =
                await guild.members.fetchMe()
                    .catch(() => null);

            if (
                !botMember ||
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageChannels
                )
            ) {
                pendingActions.delete(actionId);
                return interaction.update({
                    content:
                        "❌ Botに「チャンネルの管理」権限がありません。",
                    embeds: [],
                    components: []
                });
            }

            const targets =
                pending.targetIds
                    .map(id => guild.channels.cache.get(id))
                    .filter(
                        channel =>
                            channel &&
                            channel.type ===
                                ChannelType.GuildText
                    );

            if (targets.length === 0) {

                pendingActions.delete(actionId);
                return interaction.update({
                    content:
                        "ℹ️ 削除対象のチャンネルはありません。",
                    embeds: [],
                    components: []
                });

            }

            await interaction.update({
                content:
                    `🗑️ ${targets.length}個のチャンネルを削除しています……`,
                embeds: [],
                components: []
            });

            pendingActions.delete(actionId);

            let success = 0;
            let failed = 0;

            for (
                const channel
                of targets
            ) {

                try {

                    await channel.delete(
                        `一括削除 : "${pending.select}" / 実行者 : ${interaction.user.tag}`
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

            const actionId =
                id.replace(
                    "delete_roles_cancel_",
                    ""
                );

            const pending =
                pendingActions.get(actionId);

            if (!pending) {
                return interaction.reply({
                    content:
                        "❌ この操作は期限切れです。もう一度実行してください。",
                    ephemeral: true
                });
            }

            if (
                interaction.user.id !== pending.userId
            ) {

                return interaction.reply({
                    content:
                        "❌ この操作を実行した本人だけ操作できます。",
                    ephemeral: true
                });

            }

            pendingActions.delete(actionId);

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

            const actionId =
                id.replace(
                    "delete_roles_confirm_",
                    ""
                );

            const pending =
                pendingActions.get(actionId);

            if (!pending) {
                return interaction.reply({
                    content:
                        "❌ この操作は期限切れです。もう一度実行してください。",
                    ephemeral: true
                });
            }

            if (
                interaction.user.id !== pending.userId
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

            if (
                pending.guildId !== guild.id ||
                pending.type !== "roles"
            ) {
                pendingActions.delete(actionId);
                return interaction.update({
                    content:
                        "❌ 操作情報が正しくありません。",
                    embeds: [],
                    components: []
                });
            }

            const me =
                await guild.members.fetchMe()
                    .catch(() => null);

            if (!me) {

                return interaction.update({
                    content:
                        "❌ Bot自身の情報を取得できませんでした。",
                    embeds: [],
                    components: []
                });

            }

            if (
                !me.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                pendingActions.delete(actionId);
                return interaction.update({
                    content:
                        "❌ Botに「ロールの管理」権限がありません。",
                    embeds: [],
                    components: []
                });
            }

            const actor =
                await guild.members.fetch(interaction.user.id)
                    .catch(() => null);

            if (!actor) {
                pendingActions.delete(actionId);
                return interaction.update({
                    content:
                        "❌ 実行者のメンバー情報を取得できませんでした。",
                    embeds: [],
                    components: []
                });
            }

            const botHighestRole =
                me.roles.highest;

            const actorHighestRole =
                actor.roles.highest;

            const targets =
                pending.targetIds
                    .map(id => guild.roles.cache.get(id))
                    .filter(
                        role =>
                            role &&
                            role.id !== guild.id &&
                            !role.managed &&
                            role.position <
                                botHighestRole.position &&
                            role.position <
                                actorHighestRole.position
                    );

            if (targets.length === 0) {

                pendingActions.delete(actionId);
                return interaction.update({
                    content:
                        "ℹ️ 削除できる対象ロールがありません。",
                    embeds: [],
                    components: []
                });

            }

            await interaction.update({
                content:
                    `🗑️ ${targets.length}個のロールを削除しています……`,
                embeds: [],
                components: []
            });

            pendingActions.delete(actionId);

            let success = 0;
            let failed = 0;

            for (
                const role
                of targets
            ) {

                try {

                    await role.delete(
                        `ロール一括削除 : "${pending.select}" / 実行者 : ${interaction.user.tag}`
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
                    `🔎 検索 : \`${pending.select}\`\n` +
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
