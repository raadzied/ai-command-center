export interface ActiveModel {
  provider: string;
  model: string;
}

const DEFAULT: ActiveModel = { provider: 'Gemini', model: 'gemini-2.5-flash' };
let current: ActiveModel = { ...DEFAULT };

// يُستدعى عند نجاح استجابة فعلية من المزوّد، لا عند مجرد اختيار موديل.
export function setActiveModel(provider: string, model: string): void {
  if (provider.trim() === '' || model.trim() === '') return;
  current = { provider, model };
}

export function getActiveModel(): ActiveModel {
  return { ...current };
}
