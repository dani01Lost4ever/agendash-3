<script setup lang="ts">
import { computed, ref } from 'vue';

import type { JobEntry } from '../api';
import { ACTIONS, jobCount, type JobAction } from '../actions';
import ConfirmModal from './ConfirmModal.vue';

const props = defineProps<{
  action: JobAction | null;
  jobs: JobEntry[];
  busy: boolean;
}>();

const emit = defineEmits<{ confirm: [] }>();

const modal = ref<InstanceType<typeof ConfirmModal> | null>(null);

const PREVIEW = 5;
const meta = computed(() => (props.action ? ACTIONS[props.action] : ACTIONS.run));
const title = computed(() => {
  const target = props.jobs.length === 1 ? `“${props.jobs[0].job.name}”` : jobCount(props.jobs.length);
  return `${meta.value.label} ${target}?`;
});
const busyLabel = computed(() => `${meta.value.label}…`);

defineExpose({ open: () => modal.value?.open(), hide: () => modal.value?.hide() });
</script>

<template>
  <ConfirmModal
    ref="modal"
    :title="title"
    :icon="meta.icon"
    :tone="meta.tone"
    :confirm-label="meta.label"
    :busy-label="busyLabel"
    :busy="busy"
    :disabled="jobs.length === 0"
    @confirm="emit('confirm')"
  >
    <p class="text-body-secondary mb-2">{{ meta.description }}</p>
    <ul v-if="jobs.length > 1" class="confirm-job-list">
      <li v-for="job in jobs.slice(0, PREVIEW)" :key="job.job._id">{{ job.job.name }}</li>
      <li v-if="jobs.length > PREVIEW" class="text-body-secondary">and {{ jobs.length - PREVIEW }} more</li>
    </ul>
    <p v-else-if="jobs.length === 1" class="small text-body-secondary mb-0">ID <code>{{ jobs[0].job._id }}</code></p>
  </ConfirmModal>
</template>
