import { computed, ref, watch } from 'vue';

export type ThemePreference = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'agendash-theme';
const ORDER: ThemePreference[] = ['auto', 'light', 'dark'];

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return ORDER.includes(stored as ThemePreference) ? (stored as ThemePreference) : 'auto';
  } catch {
    return 'auto';
  }
}

const preference = ref<ThemePreference>(readPreference());
const media = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(media.matches);
media.addEventListener('change', (event) => {
  systemDark.value = event.matches;
});

const theme = computed(() => (preference.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : preference.value));

// Bootstrap 5.3 switches its color modes on this attribute
watch(
  theme,
  (value) => {
    document.documentElement.setAttribute('data-bs-theme', value);
  },
  { immediate: true },
);

watch(preference, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this page only
  }
});

/** Light, dark or system color mode, remembered per browser. */
export function useTheme() {
  function cycle() {
    preference.value = ORDER[(ORDER.indexOf(preference.value) + 1) % ORDER.length];
  }
  return { preference, theme, cycle };
}
