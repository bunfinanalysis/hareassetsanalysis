import type { Candle } from "../market-types";
import type {
  ABCImprovedDetection,
  ABCImprovedScenario,
} from "../elliottABCEngine";

export type HistoricalDatasetSource =
  | "memory"
  | "json"
  | "csv"
  | "fixture";

export type HistoricalEvalDataset = {
  instrument: string;
  timeframe: string;
  candles: Candle[];
  source: HistoricalDatasetSource;
  sourcePath?: string;
};

export type ReplayEvaluationOptions = {
  warmupBars?: number;
  stepSize?: number;
  lookaheadBars?: number;
  promotionLookaheadBars?: number;
  quickInvalidationBars?: number;
  includeHigherTimeframes?: boolean;
  higherTimeframeOrder?: string[];
};

export type ReplayEvaluationContext = {
  dataset: HistoricalEvalDataset;
  slice: Candle[];
  stepIndex: number;
  endIndex: number;
  higherTimeframes: Record<string, Candle[]>;
};

export type ReplayEvaluationFn = (
  context: ReplayEvaluationContext,
) => ABCImprovedDetection;

export type LoggedScenarioSnapshot = {
  id: number;
  signature: string;
  name: string;
  role:
    | ABCImprovedScenario["scenarioRole"]
    | "primary"
    | "alternate"
    | "reserve"
    | "sole";
  structureLabel: string;
  directionBias: ABCImprovedScenario["directionBias"];
  degree: ABCImprovedScenario["degree"];
  label: string;
  description: string;
  reason: string;
  invalidationLevel: number;
  invalidationReason: string;
  promotionCondition: ABCImprovedScenario["promotionCondition"];
  evidence: ABCImprovedScenario["evidence"];
  scoreComponents: ABCImprovedScenario["scoreComponents"];
  trendContext: ABCImprovedScenario["trendContext"];
  pivotSequenceUsed: ABCImprovedScenario["pivotSequenceUsed"];
  targets: ABCImprovedScenario["targets"];
  waveCProjection: number;
  primary: boolean;
  relativeStrength: ABCImprovedScenario["relativeStrength"];
  currentlyInvalidated: boolean;
};

export type StepOutcomeStatus =
  | "no-scenario"
  | "invalidated"
  | "target-reached"
  | "survived-horizon"
  | "unresolved";

export type ReplayStepOutcome = {
  status: StepOutcomeStatus;
  invalidationHit: boolean;
  targetReached: boolean;
  survivedBeyondHorizon: boolean;
  barsToOutcome: number | null;
  barsToInvalidation: number | null;
  barsToTarget: number | null;
  invalidatedQuickly: boolean;
  primaryToAlternatePromotionObserved: boolean;
  promotedScenarioSignature: string | null;
  outcomeKnownAtTime: number | null;
  horizonBarsEvaluated: number;
  lookaheadWindowComplete: boolean;
};

export type ReplayStepLog = {
  stepIndex: number;
  endIndex: number;
  timestamp: number;
  instrument: string;
  timeframe: string;
  barCount: number;
  currentBar: Candle;
  scenarioCount: number;
  noTrade: boolean;
  ambiguous: boolean;
  primaryScenario: LoggedScenarioSnapshot | null;
  alternateScenario: LoggedScenarioSnapshot | null;
  scenarios: LoggedScenarioSnapshot[];
  outcome: ReplayStepOutcome | null;
};

export type ReplayMetrics = {
  totalEvaluationSteps: number;
  stepsWithScenario: number;
  averageScenarioCount: number;
  alternateAvailabilityCount: number;
  alternateAvailabilityRate: number;
  noTradeCount: number;
  noTradeRate: number;
  ambiguousOutputCount: number;
  ambiguousOutputRate: number;
  invalidationHitCount: number;
  invalidationHitRate: number;
  averageBarsToInvalidation: number | null;
  medianBarsToInvalidation: number | null;
  primaryToAlternatePromotionCount: number;
  primaryToAlternatePromotionFrequency: number;
  stableTransitionCount: number;
  totalComparableTransitions: number;
  scenarioStabilityRate: number;
  directionalFollowThroughCount: number;
  directionalFollowThroughRate: number;
  quickStructuralFailureCount: number;
  quickStructuralFailureRate: number;
  countChurnEvents: number;
  countChurnRate: number;
  structurallyInvalidVeryQuicklyRate: number;
  outcomeBreakdown: Record<StepOutcomeStatus, number>;
};

export type ReplayEvaluationResult = {
  dataset: {
    instrument: string;
    timeframe: string;
    candleCount: number;
    source: HistoricalDatasetSource;
    sourcePath?: string;
  };
  options: Required<ReplayEvaluationOptions>;
  steps: ReplayStepLog[];
  metrics: ReplayMetrics;
};

export type ReplayEvaluationArtifacts = {
  result: ReplayEvaluationResult;
  markdownReport: string;
};
