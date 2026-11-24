import { getAgent, getAgentMeta, listRegisteredAgents } from '../src/agents/registry.js';
import { intentToAgentName, listAgents } from '../src/core/router.js';
import { CHECKS } from '../src/core/quality-checks.js';
import type { AgentName } from '../src/types.js';
import { check, finish } from './test-db-helpers.js';

const EXPECTED: AgentName[] = ['mentor', 'coder', 'designer', 'advisor', 'commander'];
const CONSULTANTS: AgentName[] = ['advisor', 'commander'];

function main(): void {
  console.log('=== STEP 82A - Agents Contract Test ===\n');

  const registered = listRegisteredAgents();
  check('five agents registered', registered.length === 5);
  for (const name of EXPECTED) {
    check(`registered: ${name}`, registered.includes(name));
    check(`resolvable: ${name}`, getAgent(name) !== null);
  }

  check('advise routes to advisor', intentToAgentName('advise') === 'advisor');
  check('plan routes to commander', intentToAgentName('plan') === 'commander');
  check('build keeps routing to coder', intentToAgentName('build') === 'coder');
  check('learn keeps routing to mentor', intentToAgentName('learn') === 'mentor');
  check('design keeps routing to designer', intentToAgentName('design') === 'designer');
  check('chat maps to mentor', intentToAgentName('chat') === 'mentor');

  const routed = listAgents();
  check(
    'listAgents reads the registry',
    routed.length === registered.length && routed.every((name) => registered.includes(name)),
  );

  for (const name of EXPECTED) {
    const meta = getAgentMeta(name);
    check(`metadata present: ${name}`, meta !== null);
    check(
      `risk level defined: ${name}`,
      meta !== null && ['low', 'medium', 'high'].includes(meta.riskLevel),
    );
    const criteria = CHECKS[name];
    check(`quality criteria present: ${name}`, criteria.length > 0);
  }

  for (const name of CONSULTANTS) {
    const agent = getAgent(name);
    check(`consultant exists: ${name}`, agent !== null);
    const prompt = agent?.systemPrompt ?? '';
    check(`no WRITE_FILE in ${name} prompt`, !prompt.includes('WRITE_FILE'));
    check(`no MKDIR in ${name} prompt`, !prompt.includes('MKDIR'));
  }

  finish();
}

main();
