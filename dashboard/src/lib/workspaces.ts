import { defaultCsvPathForSymbol } from "./paths.js";
import type { WorkspaceDefinition } from "./types.js";

const WORKSPACES: WorkspaceDefinition[] = [
  {
    workspaceId: "soxl",
    symbol: "SOXL",
    routeSlug: "soxl",
    navLabel: "백테스트 (SOXL)",
    description: "SOXL 일봉 떨사오팔 기준선과 파라미터 백테스트를 확인하는 기본 워크스페이스입니다.",
    summary: "Yahoo 조정종가 기준 SOXL 일봉 백테스트",
    defaultProfileId: "soxl_official_ddeolsao_pal_v1",
    csvPath: defaultCsvPathForSymbol("SOXL"),
    referenceMode: "soxl_reference",
    warningTags: ["Yahoo Adj Close", "Read-Only"],
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
