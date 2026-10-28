import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const swap={'@/app/chatgpt-auth':'server/shims/chatgpt-auth.ts','@/lib/connectors':'server/shims/connectors.ts','cloudflare:workers':'server/shims/cloudflare-workers.ts'};
const plugin={name:'nas',setup(b){
  b.onResolve({filter:/^(@\/|cloudflare:)/},a=>{
    if(swap[a.path])return {path:resolve(root,swap[a.path])};
    if(a.path.startsWith('@/'))return b.resolve('./'+a.path.slice(2),{resolveDir:root,kind:a.kind});
  });
}};
await build({entryPoints:[resolve(root,'server/index.ts')],bundle:true,platform:'node',format:'esm',target:'node22',outfile:resolve(root,'dist-server/server.mjs'),external:['node:*'],plugins:[plugin],resolveExtensions:['.ts','.tsx','.mts','.js','.mjs','.json'],banner:{js:"import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);"},logLevel:'info'});
