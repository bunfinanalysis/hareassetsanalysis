import type { Candle } from "../market-types";
import type {
  WaveCount,
  WaveDegree,
  WavePoint,
  WaveTrend,
} from "../elliottWaveUtils";

export type SwingKind = "high" | "low";
export type RuleStatus = "pass" | "fail" | "warning" | "pending";
export type RuleSeverity = "hard" | "soft";
export type ScenarioKind = "ab" | "abc";
export type ValidationStatus = "valid" | "provisional" | "weak" | "invalid";
export type SetupQuality = "low" | "medium" | "high";
export type HigherTimeframeAlignment = "aligned" | "mixed" | "not-aligned";
export type AnalysisStatus = "directional" | "no-trade";
export type RiskClassification =
  | "trend-aligned"
  | "counter-trend"
  | "trap-prone"
  | "ambiguous";
export type ScenarioRole = "primary" | "alternate" | "reserve" | "sole";
export type ScenarioStrength = "close" | "weaker" | "clearly-weaker";
export type TrendContext = "trend-aligned" | "counter-trend" | "ambiguous";
export type StructureType =
  | "impulse"
  | "leading-diagonal"
  | "ending-diagonal"
  | "invalid";

export type DetectedABCSwing = {
  id: string;
  index: number;
  time: number;
  price: number;
  kind: SwingKind;
  source: "fractal-zigzag";
};

export type PivotDetectionResult = {
  swings: DetectedABCSwing[];
  deviationThreshold: number;
  minBarsBetween: number;
  fractalSpan: number;
  timeframe: string;
  atr: number;
};

export type SwingLeg = {
  id: string;
  start: DetectedABCSwing;
  end: DetectedABCSwing;
  direction: WaveTrend;
  priceChange: number;
  percentChange: number;
  durationBars: number;
  durationSeconds: number;
  overlapWithPrevious: boolean;
  momentumProxy: number;
};

export type SegmentPivot = {
  index: number;
  time: number;
  price: number;
  kind: SwingKind;
};

export type SubwaveAnalysis = {
  valid: boolean;
  structure: StructureType;
  sequence: SegmentPivot[] | null;
  wave2Retracement?: number;
  wave3ToWave1Ratio?: number;
  wave4Retracement?: number;
  wave3Shortest?: boolean;
  wave4Overlap?: boolean;
};

export type CorrectiveCandidateInput = {
  anchor: DetectedABCSwing;
  a: DetectedABCSwing;
  b: DetectedABCSwing;
  c?: DetectedABCSwing;
  kind: ScenarioKind;
  direction: WaveTrend;
  degree: WaveDegree;
};

export type ABCScenarioRule = {
  id: string;
  label: string;
  status: RuleStatus;
  severity: RuleSeverity;
  detail: string;
  message: string;
  value?: number;
  target?: string;
};

export type ABCProjectionTarget = {
  level: number;
  fibRatio: number;
  probability: number;
};

export type ABCProjectionZone = {
  nextTargetPrice: number;
  minTarget: number;
  maxTarget: number;
  probability: number;
  label: string;
};

export type ABCScenario = {
  id: string;
  kind: ScenarioKind;
  direction: WaveTrend;
  degree: WaveDegree;
  count: WaveCount;
  confidence: number;
  hardRulePassed: boolean;
  rules: {
    passed: number;
    total: number;
    details: ABCScenarioRule[];
  };
  fibScore: number;
  channelScore: number;
  momentumScore: number;
  projectionTargets: ABCProjectionTarget[];
  targetZone: ABCProjectionZone | null;
  invalidationLevel: number;
  invalidationExplanation: string;
  recencyScore: number;
  candlesFromLatest: number;
  selectionScore: number;
  scoreBreakdown: Array<{ label: string; value: number }>;
  reasonSummary: string;
  reasons: string[];
  swings: DetectedABCSwing[];
  detectorMeta: {
    deviationThreshold: number;
    minBarsBetween: number;
    fractalSpan: number;
    timeframe: string;
  };
};

export type ABCDetectionOptions = {
  timeframe?: string;
  degree?: WaveDegree;
  limit?: number;
};

export type ABCImprovedTarget = {
  price: number;
  fibRatio: string;
  probability: number;
};

export type RankedTargetCandidate = {
  price: number;
  fibRatio: number;
  probability: number;
};

export type ABCImprovedChannelLine = {
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
};

export type ABCImprovedChannel = {
  upper: number;
  lower: number;
  upperLine: ABCImprovedChannelLine;
  lowerLine: ABCImprovedChannelLine;
};

export type ABCImprovedSubWaveLabel = {
  label: string;
  wave: "A" | "B" | "C";
  price: number;
  time: number;
};

export type ScenarioEvidenceCheck = {
  label: string;
  status: RuleStatus;
  detail: string;
};

export type ScenarioEvidence = {
  validationStatus: ValidationStatus;
  setupQuality: SetupQuality;
  higherTimeframeAlignment: HigherTimeframeAlignment;
  invalidation: {
    level: number;
    explanation: string;
  };
  alternateCountExists: boolean;
  evidenceChecks: ScenarioEvidenceCheck[];
  evidenceSummary: {
    passed: number;
    warning: number;
    failed: number;
  };
  riskClassification: RiskClassification;
};

export type NoTradeReasonCode =
  | "no-valid-scenario"
  | "close-scenario-scores"
  | "higher-timeframe-conflict"
  | "weak-structure"
  | "poor-pivot-quality"
  | "insufficient-confirmation"
  | "choppy-overlap"
  | "unreliable-invalidation";

export type NoTradeReasonDetail = {
  code: NoTradeReasonCode;
  label: string;
  detail: string;
};

export type NoTradeConfirmation = {
  label: string;
  detail: string;
  level?: number;
  direction?: "above" | "below" | "outside";
};

export type NoTradeState = {
  status: "no-trade";
  title: string;
  reasons: string[];
  reasonDetails: NoTradeReasonDetail[];
  evidenceSummary: {
    passed: number;
    warning: number;
    failed: number;
    scenarioCount: number;
  };
  expectedToResolveWithMoreData: boolean;
  confirmationNeeded: NoTradeConfirmation[];
  dominantScenarioId: number | null;
  alternateScenarioId: number | null;
};

export type ScenarioPivotReference = {
  label: "Anchor" | "A" | "B" | "C";
  price: number;
  time: number;
};

export type ScenarioScoreComponent = {
  key:
    | "pivot-quality"
    | "retracement-quality"
    | "subdivision-quality"
    | "fib-confluence"
    | "higher-timeframe-alignment"
    | "structural-cleanliness";
  label: string;
  value: number;
};

export type ScenarioPromotionCondition = {
  level: number;
  reason: string;
};

export type ScenarioDisplayPlan = {
  scenarioRole: ScenarioRole;
  relativeStrength: ScenarioStrength | null;
  promotionCondition: ScenarioPromotionCondition | null;
  trendContext: TrendContext;
  scoreComponents: ScenarioScoreComponent[];
  currentlyInvalidated: boolean;
};

export type ABCImprovedScenario = {
  id: number;
  name: string;
  confidence: number;
  label: string;
  structureLabel: string;
  description: string;
  reason: string;
  directionBias: WaveTrend;
  degree: WaveDegree;
  pivotSequenceUsed: ScenarioPivotReference[];
  waveCProjection: number;
  targets: ABCImprovedTarget[];
  invalidationLevel: number;
  invalidationReason: string;
  channel: ABCImprovedChannel;
  momentumScore: number;
  volumeScore: number;
  primary: boolean;
  scenarioRole: ScenarioRole;
  relativeStrength: ScenarioStrength | null;
  promotionCondition: ScenarioPromotionCondition | null;
  trendContext: TrendContext;
  currentlyInvalidated: boolean;
  fibRelationships: string[];
  subWaveLabels: ABCImprovedSubWaveLabel[];
  scoreBreakdown: Array<{ label: string; value: number }>;
  scoreComponents: ScenarioScoreComponent[];
  validation: ABCScenario["rules"];
  evidence: ScenarioEvidence;
  legacyScenario: ABCScenario;
};

export type ABCImprovedDetection = {
  analysisStatus: AnalysisStatus;
  noTradeState: NoTradeState | null;
  scenarios: ABCImprovedScenario[];
  primaryScenario: ABCImprovedScenario | null;
  alternateScenario: ABCImprovedScenario | null;
  chartOverlays: {
    priceRange: {
      minPrice: number;
      maxPrice: number;
      dataLow: number;
      dataHigh: number;
      padding: number;
    } | null;
    channels: Array<ABCImprovedChannel & { scenarioId: number; primary: boolean }>;
    labels: ABCImprovedSubWaveLabel[];
    targetTables: Array<{
      scenarioId: number;
      name: string;
      targets: ABCImprovedTarget[];
    }>;
    invalidations: Array<{
      scenarioId: number;
      level: number;
      explanation: string;
    }>;
  };
};

export type HigherTimeframeInputMap = Record<string, unknown[]>;

export type HigherABCContext = {
  timeframe: string;
  direction: WaveTrend;
  confidence: number;
  referenceHigh: number;
  referenceLow: number;
};

export type FibRelationship = {
  kind: "b-retrace" | "c-target";
  ratio: number;
  price?: number;
};

export type RankedABCScenarioData = {
  baseScenario: ABCScenario;
  confidence: number;
  volumeScore: number;
  momentumScore: number;
  higherContext: HigherABCContext | null;
  targets: RankedTargetCandidate[];
  channel: ABCImprovedChannel;
  fibRelationships: FibRelationship[];
  subWaveLabels: ABCImprovedSubWaveLabel[];
  scoreBreakdown: Array<{ label: string; value: number }>;
};

export type PriceClamp = (price: number) => number;
export type PriceNormalizer = (price: number) => number;

export type NormalizedScenarioPriceRange = {
  clampPrice: PriceClamp;
  normalizePrice: PriceNormalizer;
  minPrice: number;
  maxPrice: number;
  dataLow: number;
  dataHigh: number;
  padding: number;
};

export type ManualCorrectiveScenarioInput = {
  count: WaveCount;
  candles: Candle[];
  degree: WaveDegree;
  timeframe: string;
  anchor: DetectedABCSwing;
  a: DetectedABCSwing;
  b: DetectedABCSwing;
  c?: DetectedABCSwing;
};

export type CorrectiveCandidateEvaluation = {
  candidate: CorrectiveCandidateInput;
  count: WaveCount;
  aStructure: SubwaveAnalysis;
  cStructure: SubwaveAnalysis;
  waveBToARatio?: number;
  waveCToARatio?: number;
  hardRules: ABCScenarioRule[];
  softRules: ABCScenarioRule[];
};

export type FibProjectionInput = {
  candidate: CorrectiveCandidateInput;
  waveBToARatio?: number;
  waveCToARatio?: number;
  cStructure: SubwaveAnalysis;
};

export type RuleFactoryInput = {
  id: string;
  label: string;
  status: RuleStatus;
  severity: RuleSeverity;
  detail: string;
  message: string;
  value?: number;
  target?: string;
};

export type ChannelFitResult = {
  score: number;
  atr: number;
};

export type SwingCandidateContext = {
  candles: Candle[];
  timeframe: string;
  degree: WaveDegree;
};

export type ExplanationLayerInput = {
  rankedScenario: RankedABCScenarioData;
  index: number;
  alternateCountExists: boolean;
  displayPlan: ScenarioDisplayPlan;
};

export type TargetTableEntry = {
  price: number;
  fibRatio: string;
  probability: number;
};

export type WavePointFactory = (
  swing: DetectedABCSwing,
  label: "A" | "B" | "C",
  degree: WaveDegree,
) => WavePoint;
