// The assistant's model, answer style and whether the living go to it, as
// chosen in Settings, each in a cookie for the reason appearance.ts gives.

import { signal } from '@lit-labs/signals';

import {
  DEFAULT_MODEL,
  DEFAULT_STYLE,
  isAnswerStyle,
  isAssistantModel
} from '@/common/assistant-choices';
import type { AnswerStyle, AssistantModel } from '@/common/assistant-choices';

const MODEL_COOKIE = 'sl-assistant-model';
const STYLE_COOKIE = 'sl-assistant-style';
const LIVING_COOKIE = 'sl-assistant-living';
const YEAR_S = 365 * 24 * 60 * 60;

function cookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
}

function keep(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR_S}; samesite=lax`;
}

function storedModel() {
  const value = cookie(MODEL_COOKIE);
  return isAssistantModel(value) ? value : DEFAULT_MODEL;
}

function storedStyle() {
  const value = cookie(STYLE_COOKIE);
  return isAnswerStyle(value) ? value : DEFAULT_STYLE;
}

export const assistantModel = signal<AssistantModel>(storedModel());
// Off unless the person turned it on.
export const includeLiving = signal(cookie(LIVING_COOKIE) === 'on');
export const answerStyle = signal<AnswerStyle>(storedStyle());

export function setAssistantModel(model: AssistantModel) {
  keep(MODEL_COOKIE, model);
  assistantModel.set(model);
}

export function setAnswerStyle(style: AnswerStyle) {
  keep(STYLE_COOKIE, style);
  answerStyle.set(style);
}

export function setIncludeLiving(on: boolean) {
  keep(LIVING_COOKIE, on ? 'on' : 'off');
  includeLiving.set(on);
}
