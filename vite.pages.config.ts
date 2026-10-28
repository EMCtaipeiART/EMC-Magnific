import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
export default defineConfig({
 root:'pages',base:'/EMC-Magnific/',plugins:[react()],
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 build:{outDir:'../dist-pages',emptyOutDir:true},
 server:{host:'127.0.0.1',port:5174,fs:{allow:['..']}},
});
