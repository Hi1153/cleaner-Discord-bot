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
    console.error("DISCORD_TOKEN または CLIENT_ID が設定されていません。");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

/* =========================================================
   スラッシュコマンド
   ========================================================= */

const commands = [

    /* -----------------------------------------------------
       チャンネル名から一括削除
       ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       荒らしロール一括削除
       ----------------------------------------------------- */

    new SlashCommandBuilder()
        .setName("delete-roles")
        .setDescription("Botより下にある削除可能なロールを一括削除")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageRoles.toString()
        )
        .toJSON()

];

/* =========================================================
   Ready
   ========================================================= */

client.once(Events.ClientReady, async () => {

    console.log(`ログイン完了 : ${client.user.tag}`);
    console.log(`参加Server数 : ${client.guilds.cache.size}`);

    for (const guild of client.guilds.cache.values()) {
        console.log(`Server : ${guild.name} (${guild.id})`);
    }

    try {

        const rest = new REST({ version: "10" }).setToken(TOKEN);

        console.log("スラッシュコマンドを登録中...");

        /*
         * グローバル登録ではなく、
         * Botが現在参加している全Serverへ登録する。
         */

        for (const guild of client.guilds.cache.values()) {

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
                    `コマンド登録完了 : ${guild.name}`
                );

            } catch (error) {

                console.error(
                    `コマンド登録失敗 : ${guild.name}`,
                    error.message
                );

            }
        }

        console.log("スラッシュコマンド登録完了");

    } catch (error) {

        console.error(
            "コマンド登録エラー :",
            error
        );

    }

});

/* =========================================================
   BotがServerに追加されたとき
   ========================================================= */

client.on(Events.GuildCreate, async guild => {

    console.log(
        `Server参加 : ${guild.name} (${guild.id})`
    );

    try {

        const rest = new REST({ version: "10" })
            .setToken(TOKEN);

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
            `コマンド登録完了 : ${guild.name}`
        );

    } catch (error) {

        console.error(
            `コマンド登録失敗 : ${guild.name}`,
            error
        );

    }

});

/* =========================================================
   Interaction
   ========================================================= */

client.on(Events.InteractionCreate, async interaction => {

    try {

        /* =================================================
           スラッシュコマンド
           ================================================= */

        if (interaction.isChatInputCommand()) {

            /* =============================================
               delete-name
               ============================================= */

            if (interaction.commandName === "delete-name") {

                if (!interaction.guild) {

                    return interaction.reply({
                        content:
                            "❌ Server内で実行してください。",
                        ephemeral: true
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

            /* =============================================
               delete-roles
               ============================================= */

            if (interaction.commandName === "delete-roles") {

                if (!interaction.guild) {

                    return interaction.reply({
                        content:
                            "❌ Server内で実行してください。",
                        ephemeral: true
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

                /*
                 * Bot自身のメンバー情報を取得
                 */

                const me =
                    guild.members.me ||
                    await guild.members.fetch(
                        client.user.id
                    ).catch(() => null);

                if (!me) {

                    return interaction.reply({
                        content:
                            "❌ Bot自身のメンバー情報を取得できませんでした。",
                        ephemeral: true
                    });

                }

                /*
                 * Botの最高位ロール
                 */

                const botHighestRole =
                    me.roles.highest;

                /*
                 * 削除対象
                 *
                 * @everyone       → 除外
                 * managed         → 除外
                 * Botより上       → 除外
                 * Botと同じ位置   → 除外
                 */

                const targets =
                    guild.roles.cache.filter(role => {

                        return (
                            role.id !== guild.id &&
                            !role.managed &&
                            role.position <
                                botHighestRole.position
                        );

                    });

                if (targets.size === 0) {

                    return interaction.reply({
                        content:
                            "ℹ️ Botより下に削除可能なロールがありません。",
                        ephemeral: true
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
                            `Botより下にある削除可能なロールを削除します。\n\n` +
                            `${names}${more}`
                        )
                        .addFields({
                            name: "対象数",
                            value:
                                `${targets.size}ロール`,
                            inline: true
                        })
                        .setFooter({
                            text:
                                "管理ロール・連携ロール・Botより上のロールは削除されません"
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

        /* =================================================
           ボタン
           ================================================= */

        if (interaction.isButton()) {

            const id = interaction.customId;

            /* =============================================
               チャンネル削除キャンセル
               ============================================= */

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

            /* =============================================
               チャンネル削除確認
               ============================================= */

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

                const count =
                    targets.size;

                /*
                 * 先に公開メッセージへ変更
                 */

                await interaction.update({
                    content:
                        `🗑️ ${count}個のチャンネルを削除しています……\n` +
                        `実行者: <@${interaction.user.id}>`,
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
                            `一括削除: "${keyword}" / 実行者: ${interaction.user.tag}`
                        );

                        success++;

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    350
                                )
                        );

                    } catch (error) {

                        failed++;

                        console.error(
                            `チャンネル削除失敗: ${channel.name}`,
                            error.message
                        );

                    }

                }

                /*
                 * 完了メッセージは公開
                 */

                return interaction.followUp({
                    content:
                        `✅ **チャンネル一括削除完了**\n\n` +
                        `🗑️ 削除: **${success}**\n` +
                        `❌ 失敗: **${failed}**\n` +
                        `👤 実行者: <@${interaction.user.id}>`,
                    ephemeral: false
                });

            }

            /* =============================================
               ロール削除キャンセル
               ============================================= */

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

            /* =============================================
               ロール削除確認
               ============================================= */

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

                /*
                 * Bot自身を取得
                 */

                const me =
                    guild.members.me ||
                    await guild.members.fetch(
                        client.user.id
                    ).catch(() => null);

                if (!me) {

                    return interaction.update({
                        content:
                            "❌ Bot自身のメンバー情報を取得できませんでした。",
                        embeds: [],
                        components: []
                    });

                }

                /*
                 * Bot最高位ロール
                 */

                const botHighestRole =
                    me.roles.highest;

                /*
                 * ここで現在のロール一覧を
                 * もう一度取得する。
                 *
                 * 確認画面を出した後に
                 * ロールが増減していても安全。
                 */

                const targets =
                    guild.roles.cache.filter(
                        role =>
                            role.id !== guild.id &&
                            !role.managed &&
                            role.position <
                                botHighestRole.position
                    );

                if (targets.size === 0) {

                    return interaction.update({
                        content:
                            "ℹ️ 削除できるロールがありません。",
                        embeds: [],
                        components: []
                    });

                }

                const count =
                    targets.size;

                /*
                 * 公開メッセージ
                 */

                await interaction.update({
                    content:
                        `🗑️ ${count}個のロールを削除しています……\n` +
                        `実行者: <@${interaction.user.id}>`,
                    embeds: [],
                    components: []
                });

                let success = 0;
                let failed = 0;

                /*
                 * ロール削除
                 *
                 * 高い位置のロールから削除。
                 */

                const roles =
                    [...targets.values()]
                        .sort(
                            (a, b) =>
                                b.position -
                                a.position
                        );

                for (
                    const role
                    of roles
                ) {

                    try {

                        /*
                         * 念のため削除直前にも
                         * Botより下か確認。
                         */

                        if (
                            role.managed ||
                            role.id === guild.id ||
                            role.position >=
                                botHighestRole.position
                        ) {

                            failed++;

                            continue;

                        }

                        await role.delete(
                            `荒らし対策によるロール一括削除 / 実行者: ${interaction.user.tag}`
                        );

                        success++;

                        /*
                         * Discord APIへの連続アクセスを
                         * 少し間隔を空ける。
                         */

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
                            `ロール削除失敗: ${role.name} (${role.id})`,
                            error.message
                        );

                    }

                }

                /*
                 * 完了メッセージはServer全体に公開
                 */

                return interaction.followUp({
                    content:
                        `✅ **ロール一括削除完了**\n\n` +
                        `🗑️ 削除: **${success}**\n` +
                        `❌ 失敗: **${failed}**\n` +
                        `👤 実行者: <@${interaction.user.id}>`,
                    ephemeral: false
                });

            }

        }

    } catch (error) {

        console.error(
            "Interaction処理エラー:",
            error
        );

        /*
         * 既に応答済みの場合
         */

        try {

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                await interaction.followUp({
                    content:
                        "❌ 処理中にエラーが発生しました。",
                    ephemeral: true
                });

            } else {

                await interaction.reply({
                    content:
                        "❌ 処理中にエラーが発生しました。",
                    ephemeral: true
                });

            }

        } catch {}

    }

});

/* =========================================================
   Discordエラー
   ========================================================= */

client.on(
    Events.Error,
    error => {
        console.error(
            "Discord Client Error:",
            error
        );
    }
);

/* =========================================================
   Promiseエラー
   ========================================================= */

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

/* =========================================================
   Login
   ========================================================= */

client.login(TOKEN);
