import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import KongInstancePicker from './components/KongInstancePicker/KongInstancePicker';

export const KongInstancePickerSchema = {
  returnValue: { type: 'string' as const },
};

export const KongInstancePickerExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'KongInstancePicker',
    component: KongInstancePicker,
    schema: KongInstancePickerSchema,
  }),
);
