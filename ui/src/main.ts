import { createApp } from 'vue';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'material-icons/iconfont/round.css';
import '@fontsource/roboto/latin-300.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/days-one/latin-400.css';

import './styles/app.css';
import './styles/auth.css';

// Applies the saved light or dark theme before the first render
import './composables/useTheme';
import App from './App.vue';

createApp(App).mount('#agendash-root');
