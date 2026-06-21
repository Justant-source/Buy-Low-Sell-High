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
    referenceMode: "soxl_reference",
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

export function mentorTabEnabled(workspaceId: string): boolean {
  return getWorkspaceDefinition(workspaceId)?.referenceMode === "soxl_reference";
}
