import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { ClassifiedAction, ApprovalDecision } from '../types.js';
import type { ApprovalStrategy } from './approval.js';

// استراتيجية CLI: تسأل المستخدم في الطرفية.
export const cliStrategy: ApprovalStrategy = {
  async ask(
    action: ClassifiedAction,
    _auditId: string,
  ): Promise<ApprovalDecision> {
    console.log('');
    console.log('⚠️  عملية تحتاج موافقتك:');
    console.log(`   النوع: ${action.type}`);
    console.log(`   الهدف: ${action.target}`);
    console.log(`   السبب: ${action.reason}`);
    console.log(`   التصنيف: ${action.explanation}`);
    console.log('');

    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const answer = await rl.question('موافقتك؟ [y/N]: ');
      const normalized = answer.trim().toLowerCase();
      return normalized === 'y' || normalized === 'yes'
        ? 'user_approved'
        : 'user_denied';
    } finally {
      rl.close();
    }
  },
};