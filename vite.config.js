import { defineConfig } from 'vite';
export default defineConfig({base:'./',server:{host:'127.0.0.1',watch:{ignored:['**/release/**','**/artifacts/**']}},build:{target:'es2022',chunkSizeWarningLimit:1000}});
