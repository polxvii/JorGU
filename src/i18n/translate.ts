import type { Language } from '../features/settings/types';
import { type MessageKey, en } from './en';
import { th } from './th';

export type Params = Record<string, string | number>;

export function translate(lang: Language, key: MessageKey, params?: Params): string {
  const text = (lang === 'th' ? th[key] : undefined) ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
