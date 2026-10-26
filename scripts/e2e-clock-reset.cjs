/* Restablece sólo el reloj ajustable del backend aislado; no toca el reloj del sistema operativo. */
const fs=require('node:fs');const path=require('node:path');const {ROOT,BASE,BACKEND,DB_NAME,call,ok,one}=require('./e2e-cierre-support.cjs');
const {spawnSync}=require('node:child_process');
(async()=>{
 const info=JSON.parse(spawnSync('docker',['inspect',BACKEND],{encoding:'utf8'}).stdout)[0];
 const env=Object.fromEntries(info.Config.Env.filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 if(!env.DB_URL.includes(`databaseName=${DB_NAME};`)||!env.SPRING_PROFILES_ACTIVE.includes('e2e'))throw new Error('Backend no aislado');
 const vars={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0&&!line.trim().startsWith('#'))vars[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}
 const token=(await ok('/auth/login',{method:'POST',body:{username:vars.BOOTSTRAP_ADMIN_USERNAME,password:vars.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const result=await ok('/e2e/clock',{method:'PUT',token,body:{reset:true}});console.log('Reloj E2E restablecido; offsetSeconds='+result.offsetSeconds);
})().catch(e=>{console.error(e);process.exitCode=1;});
