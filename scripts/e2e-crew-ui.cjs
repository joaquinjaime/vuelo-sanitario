const { chromium } = require('playwright');
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>raw+=s);
process.stdin.on('end',async()=>{
 const t=JSON.parse(raw),browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  async function login(name){const p=await browser.newPage();await p.goto('http://127.0.0.1:18081/');await p.getByLabel('Usuario',{exact:true}).fill(name);await p.getByLabel('Contraseña',{exact:true}).fill(t.password);await p.getByRole('button',{name:'Iniciar sesión'}).click();return p;}
  const ops=await login(t.ops);const area=ops.getByRole('heading',{name:'Centro de Operaciones'}).locator('..');await area.locator('select').first().selectOption(t.flightId,{timeout:30000});
  const crew=area.getByRole('heading',{name:'Tripulación'}).locator('..');await crew.getByLabel('Función de tripulación').selectOption('MEDICO');
  const option=crew.getByLabel('Personal disponible').locator('option').filter({hasText:t.memberName}).locator(`xpath=self::option[@value="${t.memberId}"]`);await option.waitFor({state:'attached',timeout:30000});await crew.getByLabel('Personal disponible').selectOption(t.memberId);await crew.getByRole('button',{name:'Asignar tripulante'}).click();
  await crew.locator('strong').filter({hasText:t.memberName}).waitFor({timeout:30000});
  const cmd=await login(t.cmd);const planning=cmd.getByRole('heading',{name:'Planificación operativa'}).locator('..');await planning.locator('select').first().selectOption(t.flightId,{timeout:30000});
  const commandCrew=planning.getByRole('heading',{name:'Tripulación'}).locator('..');await commandCrew.locator('strong').filter({hasText:t.memberName}).waitFor({timeout:30000});
  if(await commandCrew.getByRole('button',{name:'Retirar'}).count())throw Error('El comandante puede modificar tripulación');
  console.log('PASS: asignación desde Operaciones y consulta sin modificación por Comandante');
 } finally {await browser.close();}
});
