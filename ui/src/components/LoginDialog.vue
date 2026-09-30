<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import { session, submitLogin } from '../auth';

const key = ref('');
const empty = ref(false);
const input = ref<HTMLInputElement | null>(null);

watch(
  () => session.loginOpen,
  async (open) => {
    document.documentElement.classList.toggle('agendash-login-open', open);
    if (open) {
      key.value = '';
      empty.value = false;
      await nextTick();
      input.value?.focus();
    }
  },
  { immediate: true },
);

function submit() {
  const value = key.value.trim();
  if (!value) {
    empty.value = true;
    input.value?.focus();
    return;
  }
  submitLogin(value);
}
</script>

<template>
  <div v-if="session.loginOpen" class="agendash-login" role="dialog" aria-modal="true" aria-labelledby="agendash-login-title">
    <form class="agendash-login-panel card shadow-lg" novalidate @submit.prevent="submit">
      <div class="card-body p-4">
        <h1 id="agendash-login-title" class="h4 mb-2">Agendash</h1>
        <p class="text-secondary mb-3">Enter your API key to open the dashboard.</p>
        <div v-if="empty" class="alert alert-danger py-2" role="alert">Enter the API key.</div>
        <div v-else-if="session.rejected" class="alert alert-danger py-2" role="alert">This API key was not accepted. Check it and try again.</div>
        <label for="agendash-login-key" class="form-label">API key</label>
        <input id="agendash-login-key" ref="input" v-model="key" type="password" name="apiKey" class="form-control mb-3" autocomplete="current-password" required>
        <button type="submit" class="btn btn-primary w-100">Sign in</button>
      </div>
    </form>
  </div>
</template>
