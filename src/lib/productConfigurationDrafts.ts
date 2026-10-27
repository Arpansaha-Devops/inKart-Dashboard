import type { ProductConfiguration } from '../types';

type ConfigurationDraft = { configuration: ProductConfiguration; dirty: boolean };
export type ProductConfigurationDraftState = ConfigurationDraft & {
  categoryId: string;
  categories: Map<string, ConfigurationDraft>;
};
type Action =
  | { type: 'selectCategory'; categoryId: string }
  | { type: 'update'; configuration: ProductConfiguration }
  | { type: 'reset' };

export const createProductConfigurationDraft = (): ProductConfigurationDraftState => ({
  categoryId: '', configuration: { enabled: false, fields: [] }, dirty: false, categories: new Map(),
});

// Unsaved form state only; this does not store category defaults or persist data.
export function productConfigurationDraftReducer(state: ProductConfigurationDraftState, action: Action): ProductConfigurationDraftState {
  if (action.type === 'reset') return createProductConfigurationDraft();
  if (action.type === 'update') return state.categoryId
    ? { ...state, configuration: action.configuration, dirty: true }
    : state;
  if (action.categoryId === state.categoryId) return state;
  const categories = new Map(state.categories);
  if (state.categoryId) categories.set(state.categoryId, { configuration: structuredClone(state.configuration), dirty: state.dirty });
  const draft = categories.get(action.categoryId);
  return {
    categoryId: action.categoryId, categories,
    configuration: draft ? structuredClone(draft.configuration) : { enabled: !!action.categoryId, fields: [] },
    dirty: draft?.dirty ?? false,
  };
}
