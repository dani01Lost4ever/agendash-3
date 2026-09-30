// Lets tools without Vue support (typescript-eslint) type `.vue` imports; vue-tsc reads the real components.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent;
  export default component;
}
