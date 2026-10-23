export {};

export interface ApprovalAction {
  type: string;
  target: string;
  reason: string;
  risk: string;
  explanation: string;
}

export interface ApprovalRequestData {
  auditId: string;
  action: ApprovalAction;
}

declare global {
  interface Window {
    api: {
      sendInput: (text: string) => Promise<{
        ok: boolean;
        intent?: string;
        agentUsed?: string | null;
        content?: string;
        elapsedMs?: number;
        error?: string;
      }>;
      respondApproval: (auditId: string, approved: boolean) => void;
      onApprovalRequest: (callback: (data: ApprovalRequestData) => void) => void;
    };
  }
}
