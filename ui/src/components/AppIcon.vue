<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <span class="material-icons-round app-icon" aria-hidden="true">{{ name }}</span>
</template>
