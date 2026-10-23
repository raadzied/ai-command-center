import { useState } from 'react';
import { AgentMap } from './AgentMap';
import { Chat } from './Chat';
import { ApprovalModal } from './ApprovalModal';
import type { ApprovalRequestData } from './window';

export function App(): React.JSX.Element {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequestData | null>(null);
  const [taskInfo, setTaskInfo] = useState<{ index: number; total: number } | null>(null);

  const handleRespondApproval = (approved: boolean): void => {
    if (approvalRequest) {
      window.api.respondApproval(approvalRequest.auditId, approved);
      setApprovalRequest(null);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AI Command Center</h1>
        <div className="status">3 وكلاء · جاهز {activeAgent ? `· النشط: ${activeAgent}` : ''}</div>
      </header>
      <div className="app-body">
        <div className="map-panel">
          <AgentMap activeAgent={activeAgent} taskInfo={taskInfo} />
        </div>
        <div className="chat-panel">
          <Chat
            onActiveAgent={setActiveAgent}
            onTaskInfo={setTaskInfo}
            onApprovalRequest={setApprovalRequest}
          />
        </div>
      </div>
      <ApprovalModal
        request={approvalRequest}
        onRespond={handleRespondApproval}
      />
    </div>
  );
}
