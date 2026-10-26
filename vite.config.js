import { defineConfig } from 'vite';
export default defineConfig({base:'./',server:{host:'127.0.0.1',watch:{ignored:['**/release/**','**/artifacts/**','**/tools/**']}},build:{target:'es2022',chunkSizeWarningLimit:1200}});
