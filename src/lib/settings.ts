import * as SecureStore from 'expo-secure-store';

const KEY = 'anthropic_api_key';
const MODEL = 'vision_model';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', hint: 'Most accurate, about 3–5¢ a scan' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', hint: 'Much cheaper, weaker at reading markings' },
] as const;
export const DEFAULT_MODEL = MODELS[0].id;

export const getApiKey = () => SecureStore.getItemAsync(KEY);
export const setApiKey = (v: string) => (v ? SecureStore.setItemAsync(KEY, v) : SecureStore.deleteItemAsync(KEY));

export async function getModel() {
  const m = await SecureStore.getItemAsync(MODEL);
  return MODELS.some((x) => x.id === m) ? m! : DEFAULT_MODEL;
}
export const setModel = (v: string) => SecureStore.setItemAsync(MODEL, v);
