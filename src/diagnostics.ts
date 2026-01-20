import { ChannelType, PermissionsBitField } from "discord.js";
import type { ToolContext } from "./tools/types.js";
import { t } from "./i18n.js";

export type DiagnosticsTopic = "overview" | "permissions" | "roles" | "channels";

export const detectDiagnosticsTopic = (raw: string, lang: string | null | undefined): DiagnosticsTopic | null => {
  const text = raw.trim().toLowerCase();
  if (text.length === 0) return null;

  const isJa = lang === "ja";
  const includesAny = (needles: string[]) => needles.some((needle) => text.includes(needle));

  const seemsAction = includesAny(
    isJa
      ? ["作", "作成", "追加", "削除", "消", "変更", "変", "リネーム", "設定", "作って", "消して", "変えて", "移動", "rename", "delete", "create", "add", "remove", "set", "update", "change"]
      : ["create", "add", "delete", "remove", "rename", "set", "update", "change", "move"]
  );
  const seemsQuestion = includesAny(
    isJa ? ["教えて", "見て", "確認", "診断", "問題", "改善", "どう", "どんな", "なに"] : ["what", "check", "review", "diagnos", "issue", "problem", "why", "how"]
  );

  if (seemsAction && !seemsQuestion) return null;

  const wantsOverview = includesAny(isJa ? ["問題点", "改善", "診断", "全体", "全般", "やばい", "まずい"] : ["issues", "problem", "diagnos", "overall", "overview"]);
  const wantsPermissions = includesAny(isJa ? ["権限", "permission", "permissions"] : ["permission", "permissions", "privilege"]);
  const wantsRoles = includesAny(isJa ? ["ロール", "role", "roles"] : ["role", "roles"]);
  const wantsChannels = includesAny(isJa ? ["チャンネル", "channel", "channels", "カテゴリ"] : ["channel", "channels", "category"]);

  if (wantsPermissions) return "permissions";
  if (wantsRoles) return "roles";
  if (wantsChannels) return "channels";
  if (wantsOverview) return "overview";

  const short = text.length <= 12;
  if (short && includesAny(isJa ? ["全体"] : ["overall", "overview"])) return "overview";
  if (short && includesAny(isJa ? ["権限"] : ["permissions"])) return "permissions";
  if (short && includesAny(isJa ? ["ロール"] : ["roles"])) return "roles";
  if (short && includesAny(isJa ? ["チャンネル"] : ["channels"])) return "channels";

  return null;
};

const formatList = (items: string[], max: number) => {
  const shown = items.slice(0, max);
  const suffix = items.length > max ? ` (+${items.length - max})` : "";
  return shown.join(", ") + suffix;
};

const countChannels = async (context: ToolContext) => {
  const channels = await context.guild.channels.fetch();
  let text = 0;
  let voice = 0;
  let category = 0;
  let forum = 0;
  let other = 0;
  const ungrouped: string[] = [];

  channels.forEach((channel) => {
    if (!channel) return;
    switch (channel.type) {
      case ChannelType.GuildText:
      case ChannelType.GuildAnnouncement:
        text += 1;
        break;
      case ChannelType.GuildVoice:
      case ChannelType.GuildStageVoice:
        voice += 1;
        break;
      case ChannelType.GuildCategory:
        category += 1;
        break;
      case ChannelType.GuildForum:
      case ChannelType.GuildMedia:
        forum += 1;
        break;
      default:
        other += 1;
        break;
    }

    const parentId = "parentId" in channel ? channel.parentId : null;
    if (channel.type !== ChannelType.GuildCategory && parentId === null) {
      ungrouped.push(`#${channel.name}`);
    }
  });

  return { text, voice, category, forum, other, ungrouped };
};

const countRoles = async (context: ToolContext) => {
  const roles = await context.guild.roles.fetch();
  const filtered = Array.from(roles.values()).filter((role) => role.id !== context.guild.id);
  const byPositionDesc = (a: (typeof filtered)[number], b: (typeof filtered)[number]) => b.position - a.position;

  const adminRoles = filtered
    .filter((role) => role.permissions.has(PermissionsBitField.Flags.Administrator))
    .sort(byPositionDesc)
    .map((role) => role.name);

  const topRoles = [...filtered].sort(byPositionDesc).slice(0, 10).map((role) => role.name);

  return { total: filtered.length, adminRoles, topRoles };
};

const botPermissionSnapshot = async (context: ToolContext) => {
  const botId = context.client.user?.id;
  if (!botId) return { ok: false as const, missing: [] as string[], highestRole: null as string | null };

  const botMember = await context.guild.members.fetch(botId).catch(() => null);
  if (!botMember) return { ok: false as const, missing: [] as string[], highestRole: null as string | null };

  const required: Array<{ flag: bigint; en: string; ja: string }> = [
    { flag: PermissionsBitField.Flags.ViewChannel, en: "View Channels", ja: "チャンネル閲覧" },
    { flag: PermissionsBitField.Flags.SendMessages, en: "Send Messages", ja: "メッセージ送信" },
    { flag: PermissionsBitField.Flags.ManageChannels, en: "Manage Channels", ja: "チャンネル管理" },
    { flag: PermissionsBitField.Flags.ManageRoles, en: "Manage Roles", ja: "ロール管理" },
    { flag: PermissionsBitField.Flags.ManageMessages, en: "Manage Messages", ja: "メッセージ管理" },
    { flag: PermissionsBitField.Flags.CreatePublicThreads, en: "Create Public Threads", ja: "公開スレッド作成" },
    { flag: PermissionsBitField.Flags.SendMessagesInThreads, en: "Send Messages in Threads", ja: "スレッドで送信" },
    { flag: PermissionsBitField.Flags.ModerateMembers, en: "Moderate Members (Timeout)", ja: "メンバー管理（タイムアウト）" },
    { flag: PermissionsBitField.Flags.KickMembers, en: "Kick Members", ja: "メンバーをキック" },
    { flag: PermissionsBitField.Flags.BanMembers, en: "Ban Members", ja: "メンバーをBAN" }
  ];

  const missing = required
    .filter((perm) => !botMember.permissions.has(perm.flag))
    .map((perm) => t(context.lang, perm.en, perm.ja));

  const highestRole = botMember.roles.highest?.name ? `${botMember.roles.highest.name} (pos=${botMember.roles.highest.position})` : null;
  return { ok: true as const, missing, highestRole };
};

export const runDiagnostics = async (context: ToolContext, topic: DiagnosticsTopic): Promise<string> => {
  if (topic === "channels") {
    const { text, voice, category, forum, other, ungrouped } = await countChannels(context);
    const ungroupedText =
      ungrouped.length > 0
        ? t(context.lang, `Ungrouped (no category): ${formatList(ungrouped, 12)}`, `カテゴリ未所属: ${formatList(ungrouped, 12)}`)
        : t(context.lang, "Ungrouped (no category): none", "カテゴリ未所属: なし");
    return [
      t(context.lang, "Channel overview", "チャンネル概要"),
      `• text=${text}, voice=${voice}, category=${category}, forum/media=${forum}, other=${other}`,
      `• ${ungroupedText}`,
      t(context.lang, "If you want, I can propose a category structure and renames.", "必要ならカテゴリ構成案やリネーム案を出します。")
    ].join("\n");
  }

  if (topic === "roles") {
    const { total, adminRoles, topRoles } = await countRoles(context);
    const adminText =
      adminRoles.length > 0
        ? t(context.lang, `Admin roles: ${formatList(adminRoles, 10)}`, `管理者権限(Administrator)ロール: ${formatList(adminRoles, 10)}`)
        : t(context.lang, "Admin roles: none", "管理者権限(Administrator)ロール: なし");
    return [
      t(context.lang, "Role overview", "ロール概要"),
      `• ${t(context.lang, "Total roles", "ロール数")}: ${total}`,
      `• ${adminText}`,
      `• ${t(context.lang, "Top roles", "上位ロール")}: ${formatList(topRoles, 10)}`,
      t(context.lang, "Tell me what you want to achieve (e.g., who should manage channels).", "目的（例: 誰がチャンネル管理するか）を教えてください。具体化できます。")
    ].join("\n");
  }

  if (topic === "permissions") {
    const snapshot = await botPermissionSnapshot(context);
    if (!snapshot.ok) {
      return t(context.lang, "I couldn't read bot permissions. Check that I am in the guild and have access.", "Botの権限を確認できませんでした。Botがサーバーに居るか/閲覧権限があるか確認してください。");
    }

    const missingText =
      snapshot.missing.length > 0
        ? t(context.lang, `Missing (guild-level): ${formatList(snapshot.missing, 12)}`, `不足（サーバー全体の権限）: ${formatList(snapshot.missing, 12)}`)
        : t(context.lang, "Missing (guild-level): none", "不足（サーバー全体の権限）: なし");

    return [
      t(context.lang, "Permissions check", "権限チェック"),
      snapshot.highestRole ? `• ${t(context.lang, "Bot highest role", "Botの最上位ロール")}: ${snapshot.highestRole}` : null,
      `• ${missingText}`,
      t(context.lang, "Note: channel-specific overwrites can still block actions.", "注意: チャンネル個別の権限上書きで実行できない場合があります。")
    ].filter(Boolean).join("\n");
  }

  // overview
  const [channels, roles, perms] = await Promise.all([countChannels(context), countRoles(context), botPermissionSnapshot(context)]);
  const adminRisk =
    roles.adminRoles.length >= 2
      ? t(context.lang, `• Risk: multiple Administrator roles (${roles.adminRoles.length}).`, `• 注意: Administrator ロールが複数あります（${roles.adminRoles.length}）。`)
      : null;
  const ungroupedRisk =
    channels.ungrouped.length >= 8
      ? t(context.lang, `• Risk: many ungrouped channels (${channels.ungrouped.length}).`, `• 注意: カテゴリ未所属チャンネルが多いです（${channels.ungrouped.length}）。`)
      : null;
  const missingRisk =
    perms.ok && perms.missing.length > 0
      ? t(context.lang, `• Bot is missing permissions: ${formatList(perms.missing, 8)}.`, `• Botの権限が不足しています: ${formatList(perms.missing, 8)}。`)
      : null;

  return [
    t(context.lang, "Server quick check", "サーバー簡易チェック"),
    `• channels: text=${channels.text}, voice=${channels.voice}, category=${channels.category}, forum/media=${channels.forum}`,
    `• roles: ${roles.total}, admin_roles=${roles.adminRoles.length}`,
    perms.ok && perms.highestRole ? `• ${t(context.lang, "Bot highest role", "Botの最上位ロール")}: ${perms.highestRole}` : null,
    t(context.lang, "Potential issues", "気になる点（候補）"),
    adminRisk ?? t(context.lang, "• OK: Administrator roles are limited.", "• OK: Administrator ロールは抑えられています。"),
    ungroupedRisk ?? t(context.lang, "• OK: channel categories look reasonable.", "• OK: カテゴリ構成は概ね良さそうです。"),
    missingRisk ?? t(context.lang, "• OK: bot permissions look sufficient at guild level.", "• OK: Botのサーバー全体権限は概ね十分です。"),
    t(context.lang, "Which area should I focus on next: channels, roles, or permissions?", "次にどれを深掘りしますか？（チャンネル / ロール / 権限）")
  ].filter(Boolean).join("\n");
};
