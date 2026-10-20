const {chromium}=require('playwright');
let raw=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',x=>raw+=x);
process.stdin.on('end',async()=>{
 const t=JSON.parse(raw), browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  async function login(name){const p=await browser.newPage();await p.goto('http://127.0.0.1:18081/');await p.getByLabel('Usuario',{exact:true}).fill(name);await p.getByLabel('Contraseña',{exact:true}).fill(t.password);await p.getByRole('button',{name:'Iniciar sesión'}).click();return p;}
  for(const [i,id] of t.flights.entries()){
   const ops=await login(t.ops), area=ops.getByRole('heading',{name:'Centro de Operaciones'}).locator('..');
   await area.locator('select').first().selectOption(String(id),{timeout:30000});
   const h=area.getByRole('heading',{name:'Hangar y preparación terrestre'}).locator('..');
   await h.getByLabel('Observaciones de Operaciones').fill('Preparación navegador '+id,{timeout:30000});
   await h.getByRole('button',{name:'Guardar información de hangar'}).click();
   await h.getByText('Observaciones de Operaciones: Preparación navegador '+id,{exact:true}).waitFor({timeout:30000});
   const cmd=await login(t.commanders[i]), planning=cmd.getByRole('heading',{name:'Planificación operativa'}).locator('..');
   await planning.locator('select').first().selectOption(String(id),{timeout:30000});
   const hc=planning.getByRole('heading',{name:'Hangar y preparación terrestre'}).locator('..');
   await hc.getByText('Observaciones de Operaciones: Preparación navegador '+id,{exact:true}).waitFor({timeout:30000});
   await hc.getByLabel('Observación del comandante').fill('Observación navegador '+id);
   await hc.getByRole('button',{name:'Guardar observación del comandante'}).click();
   await hc.getByText('Observaciones del comandante: Observación navegador '+id,{exact:true}).waitFor({timeout:30000});
   await ops.reload(); await area.locator('select').first().selectOption(String(id),{timeout:30000});
   await h.getByText('Observaciones del comandante: Observación navegador '+id,{exact:true}).waitFor({timeout:30000});
   await cmd.close(); await ops.close();
  }
  console.log('PASS Chrome: Operaciones y comandante consultan y guardan en ambos tipos');
 } finally {await browser.close();}
});
