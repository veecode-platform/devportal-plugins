import {
  useTranslationRef,
  TranslationFunction,
} from '@backstage/core-plugin-api/alpha';
import { kongServiceManagerTranslationRef } from '../translations';

export const useTranslation = (): {
  t: TranslationFunction<typeof kongServiceManagerTranslationRef.T>;
} => useTranslationRef(kongServiceManagerTranslationRef);
