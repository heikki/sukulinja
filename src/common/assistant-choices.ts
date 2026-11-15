// What the person may choose for the assistant in Settings: the Claude
// model that answers, how much it writes, and whether people who may be
// living go to it. Each question carries all three.

export const ASSISTANT_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' }
] as const;

export type AssistantModel = (typeof ASSISTANT_MODELS)[number]['id'];

export const DEFAULT_MODEL: AssistantModel = 'claude-haiku-5-5';

export const ANSWER_STYLES = [
  { id: 'terse', label: 'Terse' },
  { id: 'normal', label: 'Normal' },
  { id: 'thorough', label: 'Thorough' }
] as const;

export type AnswerStyle = (typeof ANSWER_STYLES)[number]['id'];

export const DEFAULT_STYLE: AnswerStyle = 'terse';

// Which Claude answers, how much it says, and whether the living go too.
export interface AssistantChoice {
  model: AssistantModel;
  style: AnswerStyle;
  living: boolean;
}

export const DEFAULT_CHOICE: AssistantChoice = {
  model: DEFAULT_MODEL,
  style: DEFAULT_STYLE,
  living: false
};

export function isAssistantModel(value: unknown): value is AssistantModel {
  return ASSISTANT_MODELS.some((m) => m.id === value);
}

export function isAnswerStyle(value: unknown): value is AnswerStyle {
  return ANSWER_STYLES.some((s) => s.id === value);
}
