import { defaultCsvPathForSymbol } from "./paths.js";
import type { WorkspaceDefinition } from "./types.js";

const WORKSPACES: WorkspaceDefinition[] = [
  {
    workspaceId: "soxl",
    symbol: "SOXL",
    displayName: "SOXL",
    routeSlug: "soxl",
    navLabel: "SOXL",
    description: "SOXL 일봉 떨사오팔 기준선과 파라미터 백테스트를 확인하는 기본 워크스페이스입니다.",
    summary: "Yahoo 조정종가 기준 SOXL 일봉 백테스트",
    defaultProfileId: "soxl_official_ddeolsao_pal_v1",
    csvPath: defaultCsvPathForSymbol("SOXL"),
    referenceMode: "mentor_reference",
    warningTags: ["Yahoo Adj Close", "Read-Only"],
    defaultStrategyExecutionModel: "ideal_same_close",
    defaultStrategyPriceBasis: "adjusted_close",
    defaultSweepExecutionModel: "next_open",
    defaultSweepPriceBasis: "adjusted_close",
    guideTitle: "SOXL 떨사오팔이란?",
    guideLead:
      "아주 단순하게 말하면, SOXL이 전일보다 떨어진 날 한 칸씩 사고, 매수가보다 다시 올라오면 파는 분할 매수 전략입니다.",
    guideWhyTitle: "왜 SOXL인가",
    guideWhyCopy:
      "SOXL은 반도체 지수를 3배로 추종하는 레버리지 ETF라서 변동성이 크고, 짧은 반등을 여러 Thread로 나눠 대응하는 전략 특성이 잘 드러납니다.",
  },
  {
    workspaceId: "tqqq",
    symbol: "TQQQ",
    displayName: "TQQQ",
    routeSlug: "tqqq",
    navLabel: "TQQQ",
    description: "TQQQ 일봉 떨사오팔 공식 기준선과 파라미터 백테스트를 확인하는 워크스페이스입니다.",
    summary: "Yahoo 조정종가 기준 TQQQ 일봉 백테스트",
    defaultProfileId: "tqqq_official_ddeolsao_pal_v1",
    csvPath: defaultCsvPathForSymbol("TQQQ"),
    referenceMode: "official_reference",
    warningTags: ["Yahoo Adj Close", "Read-Only"],
    defaultStrategyExecutionModel: "ideal_same_close",
    defaultStrategyPriceBasis: "adjusted_close",
    defaultSweepExecutionModel: "next_open",
    defaultSweepPriceBasis: "adjusted_close",
    guideTitle: "TQQQ 떨사오팔이란?",
    guideLead:
      "아주 단순하게 말하면, TQQQ가 전일보다 떨어진 날 한 칸씩 사고, 매수가보다 다시 올라오면 파는 분할 매수 전략입니다.",
    guideWhyTitle: "왜 TQQQ인가",
    guideWhyCopy:
      "TQQQ는 NASDAQ 100 지수를 3배로 추종하는 레버리지 ETF라서 기술주 중심의 큰 변동성이 분할 진입 전략에 어떤 차이를 만드는지 SOXL과 같은 구조로 비교하기 좋습니다.",
  },
  {
    workspaceId: "koru",
    symbol: "KORU",
    displayName: "KORU",
    routeSlug: "koru",
    navLabel: "KORU",
    description: "KORU 일봉 떨사오팔 공식 기준선과 파라미터 백테스트를 확인하는 워크스페이스입니다.",
    summary: "Yahoo 조정종가 기준 KORU 일봉 백테스트",
    defaultProfileId: "koru_official_ddeolsao_pal_v1",
    csvPath: defaultCsvPathForSymbol("KORU"),
    referenceMode: "official_reference",
    warningTags: ["Yahoo Adj Close", "Read-Only"],
    defaultStrategyExecutionModel: "ideal_same_close",
    defaultStrategyPriceBasis: "adjusted_close",
    defaultSweepExecutionModel: "next_open",
    defaultSweepPriceBasis: "adjusted_close",
    guideTitle: "KORU 떨사오팔이란?",
    guideLead:
      "아주 단순하게 말하면, KORU가 전일보다 떨어진 날 한 칸씩 사고, 매수가보다 다시 올라오면 파는 분할 매수 전략입니다.",
    guideWhyTitle: "왜 KORU인가",
    guideWhyCopy:
      "KORU는 한국 주식 지수를 3배로 추종하는 미국 상장 레버리지 ETF라서, 국내 시장 방향성에 대한 높은 변동성을 Yahoo 조정종가 기준으로 같은 대시보드에서 비교하기 좋습니다.",
  },
  {
    workspaceId: "0193t0",
    symbol: "0193T0",
    displayName: "KODEX SK하이닉스단일종목레버리지",
    routeSlug: "0193T0",
    navLabel: "KODEX SK하이닉스단일종목레버리지",
    description: "0193T0 실제 상장 후 시세와 SK하이닉스 기반 synthetic 상장 전 구간을 함께 쓰는 워크스페이스입니다.",
    summary: "Naver 일별시세 + 상장 전 synthetic 백필 기준 0193T0 일봉 백테스트",
    defaultProfileId: "0193t0_default_5x30",
    csvPath: defaultCsvPathForSymbol("0193T0"),
    referenceMode: "backtest_only",
    warningTags: ["Naver Close", "Synthetic Pre-Listing", "Read-Only"],
    defaultStrategyExecutionModel: "ideal_same_close",
    defaultStrategyPriceBasis: "raw_close_with_actions",
    defaultSweepExecutionModel: "next_open",
    defaultSweepPriceBasis: "raw_close_with_actions",
    guideTitle: "0193T0 떨사오팔이란?",
    guideLead:
      "KODEX SK하이닉스단일종목레버리지 가격이 전일보다 떨어진 날 한 칸씩 사고, 각 칸이 자기 매수가를 회복하면 파는 분할 매수 전략입니다.",
    guideWhyTitle: "왜 0193T0인가",
    guideWhyCopy:
      "0193T0는 SK하이닉스를 단일 종목으로 레버리지 추종하는 상품입니다. 상장일 이전 구간은 SK하이닉스 일간 변동을 2배로 반영한 synthetic 데이터로 이어붙여 장기 백테스트를 가능하게 합니다.",
  },
  {
    workspaceId: "233740",
    symbol: "233740",
    displayName: "KODEX 코스닥150레버리지",
    routeSlug: "233740",
    navLabel: "KODEX 코스닥150레버리지",
    description: "233740 네이버 일별시세를 기준으로 KOSDAQ 150 레버리지 ETF 백테스트를 확인하는 워크스페이스입니다.",
    summary: "Naver 일별시세 기준 233740 일봉 백테스트",
    defaultProfileId: "233740_default_5x30",
    csvPath: defaultCsvPathForSymbol("233740"),
    referenceMode: "backtest_only",
    warningTags: ["Naver Close", "Read-Only"],
    defaultStrategyExecutionModel: "ideal_same_close",
    defaultStrategyPriceBasis: "raw_close_with_actions",
    defaultSweepExecutionModel: "next_open",
    defaultSweepPriceBasis: "raw_close_with_actions",
    guideTitle: "233740 떨사오팔이란?",
    guideLead:
      "KODEX 코스닥150레버리지 가격이 전일보다 떨어진 날 한 칸씩 사고, 각 칸이 자기 매수가를 회복하면 파는 분할 매수 전략입니다.",
    guideWhyTitle: "왜 233740인가",
    guideWhyCopy:
      "233740은 코스닥150 지수를 레버리지로 추종하는 ETF라서, 국내 성장주 변동성이 분할 진입 전략에 어떤 영향을 주는지 같은 UI에서 비교하기 좋습니다.",
  },
  {
    workspaceId: "462330",
    symbol: "462330",
    displayName: "KODEX 2차전지산업레버리지",
    routeSlug: "462330",
    navLabel: "KODEX 2차전지산업레버리지",
    description: "462330 네이버 일별시세를 기준으로 2차전지 산업 레버리지 ETF 백테스트를 확인하는 워크스페이스입니다.",
    summary: "Naver 일별시세 기준 462330 일봉 백테스트",
    defaultProfileId: "462330_default_5x30",
    csvPath: defaultCsvPathForSymbol("462330"),
    referenceMode: "backtest_only",
    warningTags: ["Naver Close", "Read-Only"],
    defaultStrategyExecutionModel: "ideal_same_close",
    defaultStrategyPriceBasis: "raw_close_with_actions",
    defaultSweepExecutionModel: "next_open",
    defaultSweepPriceBasis: "raw_close_with_actions",
    guideTitle: "462330 떨사오팔이란?",
    guideLead:
      "KODEX 2차전지산업레버리지 가격이 전일보다 떨어진 날 한 칸씩 사고, 각 칸이 자기 매수가를 회복하면 파는 분할 매수 전략입니다.",
    guideWhyTitle: "왜 462330인가",
    guideWhyCopy:
      "462330은 2차전지 산업 테마의 변동성을 레버리지로 확대해 추종하는 ETF입니다. 상장 이후 실제 일별시세만 사용해 같은 백테스트 화면에서 국내 테마형 레버리지 상품을 비교할 수 있습니다.",
  },
];

export const defaultWorkspaceId = WORKSPACES[0].workspaceId;

export function listWorkspaceDefinitions(): WorkspaceDefinition[] {
  return WORKSPACES.map((workspace) => ({ ...workspace, warningTags: [...workspace.warningTags] }));
}

export function getWorkspaceDefinition(workspaceId: string): WorkspaceDefinition | undefined {
  return WORKSPACES.find((workspace) => workspace.workspaceId === workspaceId);
}

export function getWorkspaceByRouteSlug(routeSlug: string): WorkspaceDefinition | undefined {
  return WORKSPACES.find((workspace) => workspace.routeSlug === routeSlug);
}

export function defaultWorkspaceDefinition(): WorkspaceDefinition {
  return WORKSPACES[0];
}

export function officialReferenceEnabled(workspaceId: string): boolean {
  return getWorkspaceDefinition(workspaceId)?.referenceMode !== "backtest_only";
}

export function mentorTabEnabled(workspaceId: string): boolean {
  return getWorkspaceDefinition(workspaceId)?.referenceMode === "mentor_reference";
}
