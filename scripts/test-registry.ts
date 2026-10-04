import 'dotenv/config';
import {
  getAgent,
  getAgentMeta,
  listRegisteredAgents,
} from '../src/agents/registry.js';
import {
  getTool,
  listRegisteredTools,
  getToolsForAgent,
} from '../src/tools/registry.js';

function main(): void {
  console.log('=== Agent Registry Test ===\n');

  const agents = listRegisteredAgents();
  console.log(`Registered agents: ${agents.length}`);
  for (const name of agents) {
    const meta = getAgentMeta(name);
    console.log(
      `  • ${name} [risk=${meta?.riskLevel}] caps=[${meta?.capabilities.join(', ')}]`,
    );
  }

  console.log('');

  const mentor = getAgent('mentor');
  console.log(`getAgent('mentor') → ${mentor ? '✓' : '✗'}`);

  const missing = getAgent('researcher' as never);
  console.log(`getAgent('researcher') → ${missing === null ? '✓ null' : '✗'}`);

  console.log('\n=== Tool Registry Test ===\n');
  const tools = listRegisteredTools();
  console.log(`Registered tools: ${tools.length} (expected 4)`);
  for (const t of tools) {
    console.log(`  • ${t.name} [risk=${t.riskLevel}]`);
  }

  const coderTools = getToolsForAgent('coder');
  console.log(`coder tools: ${coderTools.length} (expected 4)`);

  const ok =
    agents.length === 3 &&
    mentor !== null &&
    missing === null &&
    tools.length === 4 &&
    coderTools.length === 4;

  console.log(ok ? '\n✅ TEST PASSED' : '\n❌ TEST FAILED');
  process.exit(ok ? 0 : 1);
}

main();
