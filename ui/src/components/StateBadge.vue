<script setup lang="ts">
import type { Tone } from '../jobs';
import AppIcon from './AppIcon.vue';

defineProps<{ tone: Tone; label: string; icon?: string }>();
</script>

<template>
  <span :class="['state-badge', `state-badge-${tone}`]">
    <AppIcon v-if="icon" :name="icon" />
    {{ label }}
  </span>
</template>
