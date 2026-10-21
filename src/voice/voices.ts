// خريطة: اسم الوكيل → slug صوت Hakim
// كل وكيل له صوت مميز يعكس دوره:
// - Mentor: Khalid (فصحى رسمية، صوت قيادي)
// - Designer: Layan (خليجي ناعم، أنثوي)
// - Coder: Mahmoud (فصحى ناضجة، سردية)

const DEFAULT_VOICE = 'khalid-msa';

export const AGENT_VOICES: Record<string, string> = {
  mentor: 'khalid-msa',
  designer: 'layan-saudi',
  coder: 'mahmoud-msa-narrative',
  default: DEFAULT_VOICE,
};

export function getVoiceForAgent(agentName: string | null): string {
  if (!agentName) return DEFAULT_VOICE;
  return AGENT_VOICES[agentName] ?? DEFAULT_VOICE;
}
