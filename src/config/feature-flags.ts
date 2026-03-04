export type FeatureFlags = Record<string, boolean>;

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  marketing_mobile_tables_v1: true,
  marketing_prompt_tools_v1: true,
  marketing_agent_knowledge_v1: true,
  portal_mobile_ui_v1: true,
  portal_delayed_loader_v1: true,
};

function parseFlagsFromEnv(): FeatureFlags {
  const raw = process.env.NEXT_PUBLIC_FEATURE_FLAGS;

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<FeatureFlags>((acc, [key, value]) => {
      acc[key] = Boolean(value);
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function getFeatureFlags(): FeatureFlags {
  return {
    ...DEFAULT_FEATURE_FLAGS,
    ...parseFlagsFromEnv(),
  };
}

export function isFeatureEnabled(flagName: string, fallback = false): boolean {
  const flags = getFeatureFlags();
  if (flagName in flags) {
    return Boolean(flags[flagName]);
  }

  return fallback;
}
