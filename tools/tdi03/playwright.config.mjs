import profile from '../../playwright.profile.config.js';
import worksheet from '../../playwright.worksheet-draft.config.js';
import ilaw from '../../playwright.ilaw-preview.config.js';
import { fileURLToPath } from 'node:url';
const config = { profile, worksheet, ilaw }[process.env.TDI03_BROWSER_SUITE];
if (!config) throw new Error('Unknown acceptance browser suite');
export default {
  ...config, testDir: fileURLToPath(new URL('../../e2e', import.meta.url)),
  reporter: 'json', globalTimeout: 30 * 60 * 1000,
  webServer: { ...config.webServer, cwd: fileURLToPath(new URL('../..', import.meta.url)), reuseExistingServer: false },
  projects: config.projects.map(project => ({ ...project, use: { ...project.use,
    // Intercepted synthetic responses still work; unhandled external requests
    // cannot reach a remote host, including popups not covered by page routes.
    launchOptions: { args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost'] },
  } })),
};
