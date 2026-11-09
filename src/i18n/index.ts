import { useCallback } from 'react';
import { useSettings } from '../features/settings/settingsStore';
import type { MessageKey } from './en';
import { type Params, translate } from './translate';

export type { MessageKey, Params };
export { translate };

export type TFunction = (key: MessageKey, params?: Params) => string;

export function useT(): TFunction {
  const lang = useSettings((s) => s.language);
  return useCallback((key: MessageKey, params?: Params) => translate(lang, key, params), [lang]);
}
