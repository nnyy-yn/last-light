import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const base=path.resolve(process.argv[2]||'dist');
const port=Number(process.argv[3]||5174);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.glb':'model/gltf-binary','.json':'application/json','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(url==='/')url='/index.html';const file=path.resolve(base,'.'+url);if(!file.startsWith(base+path.sep))throw Error('bad path');const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log('Production snapshot: http://127.0.0.1:'+port));
