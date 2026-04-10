import type { LaunchProfileId, MarketQuoteAsset } from "./types";

const PRICE_SCALE = 1_000_000_000_000_000_000n;
const BPS_DENOMINATOR = 10_000n;

interface QuoteAssetLaunchTargets {
  initialLaunchCap: bigint;
  graduationThreshold: bigint;
}

export interface LaunchProfileDefinition {
  id: LaunchProfileId;
  label: string;
  description: string;
  soldAtGraduationBps: number;
  targets: Record<MarketQuoteAsset, QuoteAssetLaunchTargets>;
}

export interface LaunchProfilePreview {
  launchProfile: LaunchProfileId;
  initialLaunchCap: bigint;
  graduationThreshold: bigint;
  soldAtGraduationBps: number;
  virtualQuote: bigint;
  virtualTokens: bigint;
  initialPrice: bigint;
}

const LAUNCH_PROFILE_DEFINITIONS: Record<LaunchProfileId, LaunchProfileDefinition> = {
  starter: {
    id: "starter",
    label: "Starter",
    description: "Lower graduation target for smaller community launches.",
    soldAtGraduationBps: 8_000,
    targets: {
      GAS: {
        initialLaunchCap: 60_000_000_000n,
        graduationThreshold: 200_000_000_000n,
      },
      NEO: {
        initialLaunchCap: 75n,
        graduationThreshold: 250n,
      },
    },
  },
  standard: {
    id: "standard",
    label: "Standard",
    description: "Balanced discovery depth for the default public market.",
    soldAtGraduationBps: 8_250,
    targets: {
      GAS: {
        initialLaunchCap: 180_000_000_000n,
        graduationThreshold: 600_000_000_000n,
      },
      NEO: {
        initialLaunchCap: 225n,
        graduationThreshold: 750n,
      },
    },
  },
  growth: {
    id: "growth",
    label: "Growth",
    description: "Deeper curve runway for stronger public price discovery.",
    soldAtGraduationBps: 8_500,
    targets: {
      GAS: {
        initialLaunchCap: 450_000_000_000n,
        graduationThreshold: 1_500_000_000_000n,
      },
      NEO: {
        initialLaunchCap: 550n,
        graduationThreshold: 1_800n,
      },
    },
  },
  flagship: {
    id: "flagship",
    label: "Flagship",
    description: "Highest graduation target for the deepest launch profile.",
    soldAtGraduationBps: 8_750,
    targets: {
      GAS: {
        initialLaunchCap: 900_000_000_000n,
        graduationThreshold: 3_000_000_000_000n,
      },
      NEO: {
        initialLaunchCap: 1_100n,
        graduationThreshold: 3_600n,
      },
    },
  },
};

const ORDERED_PROFILE_IDS: LaunchProfileId[] = [
  "starter",
  "standard",
  "growth",
  "flagship",
];

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error("Division by zero");
  }
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

export function listLaunchProfiles(): LaunchProfileDefinition[] {
  return ORDERED_PROFILE_IDS.map((id) => LAUNCH_PROFILE_DEFINITIONS[id]);
}

export function getLaunchProfileDefinition(profile: LaunchProfileId): LaunchProfileDefinition {
  return LAUNCH_PROFILE_DEFINITIONS[profile];
}

export function normalizeLaunchProfileId(value: string | null | undefined): LaunchProfileId | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "starter":
      return "starter";
    case "standard":
      return "standard";
    case "growth":
      return "growth";
    case "flagship":
      return "flagship";
    default:
      return null;
  }
}

export function getRecommendedLaunchProfiles(totalSupply: bigint): LaunchProfileId[] {
  if (totalSupply <= 1_000_000n) {
    return ["starter", "standard"];
  }
  if (totalSupply <= 10_000_000n) {
    return ["starter", "standard", "growth"];
  }
  if (totalSupply <= 100_000_000n) {
    return ["standard", "growth", "flagship"];
  }
  return ["growth", "flagship", "standard"];
}

export function deriveLaunchProfilePreview(
  profile: LaunchProfileId,
  quoteAsset: MarketQuoteAsset,
  curveInventory: bigint
): LaunchProfilePreview | null {
  if (curveInventory <= 0n) return null;

  const definition = getLaunchProfileDefinition(profile);
  const targets = definition.targets[quoteAsset];
  const initialPrice = (targets.initialLaunchCap * PRICE_SCALE) / curveInventory;
  const soldAtGraduationTokens =
    (curveInventory * BigInt(definition.soldAtGraduationBps)) / BPS_DENOMINATOR;
  const denominator =
    targets.graduationThreshold * PRICE_SCALE -
    soldAtGraduationTokens * initialPrice;

  if (
    targets.initialLaunchCap <= 0n ||
    initialPrice <= 0n ||
    soldAtGraduationTokens <= 0n ||
    denominator <= 0n
  ) {
    return null;
  }

  const virtualQuote = ceilDiv(
    soldAtGraduationTokens * targets.graduationThreshold * initialPrice,
    denominator
  );
  const launchTokenTotal = ceilDiv(virtualQuote * PRICE_SCALE, initialPrice);
  const virtualTokens =
    launchTokenTotal > curveInventory ? launchTokenTotal - curveInventory : 1n;

  return {
    launchProfile: profile,
    initialLaunchCap: targets.initialLaunchCap,
    graduationThreshold: targets.graduationThreshold,
    soldAtGraduationBps: definition.soldAtGraduationBps,
    virtualQuote,
    virtualTokens,
    initialPrice,
  };
}
