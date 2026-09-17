import { kongServiceManagerMessages } from '../translations/ref';

// Simple function to flatten nested objects into dot notation
function flattenMessages(obj: any, prefix = ''): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null) {
        Object.assign(flattened, flattenMessages(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }
  }

  return flattened;
}

const flattenedMessages = flattenMessages(kongServiceManagerMessages);

// Simple mock translation function — resolves against the English defaults so
// existing tests keep asserting on the same (default-locale) text.
export const mockT = (key: string, params?: any) => {
  let message = flattenedMessages[key] || key;

  // Simple interpolation: replace {{param}} with values
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      message = message.replace(
        new RegExp(`{{${paramKey}}}`, 'g'),
        String(paramValue),
      );
    }
  }

  return message;
};

// Mock useTranslation hook
export const mockUseTranslation = () => ({
  t: mockT,
});
