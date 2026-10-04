// النية المستخرجة من مدخلات المستخدم
export type Intent = 'learn' | 'build' | 'design' | 'chat';

// الوكيل المسؤول عن المهمة
export type AgentName = 'mentor' | 'coder' | 'designer';

// مهمة واحدة في خطة التنفيذ
export interface Task {
  id: string;
  description: string;
  intent: Intent;
  agentName: AgentName;
  status: 'pending' | 'running' | 'done' | 'failed';
  verificationRequired: boolean;
  dependsOn: string[];
  result?: AgentResult;
  error?: string;
}

// مخرج وكيل واحد
export interface AgentResult {
  agentName: AgentName;
  content: string;
  artifacts?: Artifact[];
  timestamp: Date;
}

// ملف أو قرار أو مهارة ينتجها وكيل
export interface Artifact {
  type: 'file' | 'code' | 'decision' | 'skill';
  path?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

// السياق المُمرَّر لكل وكيل
export interface Context {
  projectId?: number;
  memories: MemoryItem[];
  userProfile?: UserProfile;
}

// عنصر من الذاكرة
export interface MemoryItem {
  id: number;
  content: string;
  category: 'conversation' | 'decision' | 'skill' | 'project';
  similarity?: number;
}

// ملف المستخدم
export interface UserProfile {
  preferences: Record<string, unknown>;
  skills: Record<string, number>;
}

// نتيجة تصنيف النية
export interface ClassificationResult {
  intent: Intent;
  confidence: number;
  reasoning: string;
}

// واجهة مزوّد LLM — قابلة للتبديل بين cloud و local
export interface LLMProvider {
  classify(input: string): Promise<ClassificationResult>;
  embed(text: string): Promise<number[]>;
}

// فحص جودة واحد
export interface QualityCheck {
  criterion: string;
}

// مشكلة اكتشفها المراجع
export interface QualityIssue {
  description: string;
}

// نتيجة تقييم الجودة
export type QualityStatus = 'PASS' | 'FAIL' | 'REVIEW_ERROR';

export interface QualityResult {
  status: QualityStatus;
  score: number;
  issues: QualityIssue[];
  summary: string;
}

// مدخلات تقييم الجودة
export interface QualityInput {
  agent: AgentName;
  task: string;
  output: string;
  failureReason?: 'MAX_TOKENS';
}

// أنواع العمليات التي يمكن لأداة أن تطلبها
export type ActionType =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'terminal'
  | 'http_request'
  | 'git_operation';

// مستوى الخطر
export type RiskLevel = 'safe' | 'review' | 'dangerous';

// عملية مقترحة من أداة (قبل التنفيذ)
export interface ProposedAction {
  type: ActionType;
  target: string;
  reason: string;
  overwrite?: boolean;
}

// تصنيف العملية
export interface ClassifiedAction extends ProposedAction {
  risk: RiskLevel;
  explanation: string;
}

// قرار الموافقة
export type ApprovalDecision =
  | 'auto_approved'
  | 'user_approved'
  | 'user_denied'
  | 'blocked';

// نتيجة الموافقة
export interface ApprovalResult {
  decision: ApprovalDecision;
  auditId: string;
}
