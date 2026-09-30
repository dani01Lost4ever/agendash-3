<script setup lang="ts">
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    readonly?: boolean;
    lineNumbers?: boolean;
  }>(),
  { readonly: false, lineNumbers: true },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

// Prism escapes the code it tokenizes, so its output is safe to render as HTML. The code element
// has no `language-*` class, which keeps Prism's automatic page highlighting away from it.
// The trailing line break keeps the last empty line of the textarea visible.
const highlighted = computed(() => `${Prism.highlight(props.modelValue, Prism.languages.json, 'json')}<br />`);
const lineCount = computed(() => props.modelValue.split('\n').length);

const textarea = ref<HTMLTextAreaElement | null>(null);

// The box can be taller than the text, so a click below the last line still starts editing
function focusEnd(event: MouseEvent) {
  if (!textarea.value || event.target === textarea.value) return;
  textarea.value.focus();
  textarea.value.selectionStart = textarea.value.selectionEnd = textarea.value.value.length;
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function insertIndent(event: KeyboardEvent) {
  const target = event.target as HTMLTextAreaElement;
  // Edits the textarea in place so the caret stays after the inserted spaces
  target.setRangeText('  ', target.selectionStart, target.selectionEnd, 'end');
  emit('update:modelValue', target.value);
}
</script>

<template>
  <div class="json-editor-wrapper" @click="focusEnd">
    <div v-if="lineNumbers" class="json-editor-line-numbers" aria-hidden="true">
      <div v-for="line in lineCount" :key="line">{{ line }}</div>
    </div>
    <div class="json-editor-container">
      <textarea
        v-if="!readonly"
        ref="textarea"
        class="json-editor-textarea"
        :value="modelValue"
        wrap="off"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        @input="onInput"
        @keydown.tab.prevent="insertIndent"
      ></textarea>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <pre class="json-editor-highlight" :aria-hidden="!readonly"><code class="json-editor-code" v-html="highlighted"></code></pre>
    </div>
  </div>
</template>

<style>
.json-editor-wrapper {
  display: flex;
  align-items: flex-start;
  overflow: auto;
  background: var(--bs-tertiary-bg);
  font-size: 0.85rem;
  line-height: 1.5;
}
.json-editor-line-numbers,
.json-editor-textarea,
.json-editor-highlight,
.json-editor-highlight .json-editor-code {
  font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: inherit;
  line-height: inherit;
  tab-size: 2;
}
.json-editor-line-numbers {
  position: sticky;
  left: 0;
  padding: 0 0.5rem;
  min-height: 100%;
  text-align: right;
  color: var(--bs-secondary-color);
  background: var(--bs-tertiary-bg);
  user-select: none;
}
.json-editor-container {
  position: relative;
  flex: 1 1 auto;
  min-width: max-content;
}
.json-editor-textarea,
.json-editor-highlight {
  margin: 0;
  padding: 0;
  border: 0;
  white-space: pre;
}
.json-editor-textarea {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  resize: none;
  overflow: hidden;
  outline: none;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: var(--bs-body-color);
  background: transparent;
}
.json-editor-highlight {
  pointer-events: none;
  background: none;
  overflow: visible;
}
.json-editor-highlight .json-editor-code {
  padding: 0;
  color: var(--bs-body-color);
  background: none;
  white-space: pre;
}
</style>
