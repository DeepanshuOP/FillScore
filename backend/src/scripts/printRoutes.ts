// Prints the API route table in the format ARCHITECTURE.md uses, straight from the running app's
// router stack. Regenerate the table with `npm run docs:routes` instead of editing it by hand;
// src/__tests__/architectureDocs.test.ts fails if the doc and the app disagree.
import { createApp } from '../app';
import { listRoutes } from '../utils/listRoutes';

for (const route of listRoutes(createApp())) {
    console.log(`| ${route.method} | \`${route.path}\` |`);
}
