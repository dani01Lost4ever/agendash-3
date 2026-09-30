import { createApp } from 'vue';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'material-icons/iconfont/filled.css';
import '@fontsource/roboto/latin-300.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/days-one/latin-400.css';
import 'prismjs/themes/prism.css';

import './styles/styles.css';
import './styles/sidebar.css';
import './styles/joblist.css';
import './styles/jobdetails.css';
import './styles/newJob.css';
import './styles/topbar.css';

import App from './App.vue';

createApp(App).mount('#agendash-root');
