const {chromium}=require('playwright');let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>raw+=s);
process.stdin.on('end',async()=>{const t=JSON.parse(raw), browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 async function login(name){const p=await browser.newPage();await p.goto('http://127.0.0.1:18081/');await p.getByLabel('Usuario',{exact:true}).fill(name);await p.getByLabel('Contraseña',{exact:true}).fill(t.password);await p.getByRole('button',{name:'Iniciar sesión'}).click();return p;}
 for(const [i,id] of t.flights.entries()){
  const ops=await login(t.ops),area=ops.getByRole('heading',{name:'Centro de Operaciones'}).locator('..');await area.locator('select').first().selectOption(String(id),{timeout:30000});
  const section=area.getByRole('heading',{name:'Coordinaciones aeroportuarias'}).locator('..');await section.getByText('Sin gestiones registradas; no se presupone que sean necesarias.').waitFor({timeout:30000});
  await section.getByLabel('Buscar aeropuerto de coordinación').fill(t.airportName);await section.locator('select').first().selectOption(String(t.airportId),{timeout:30000});
  await section.getByLabel('Finalidad de coordinación').fill('E2E gestión '+id);await section.getByLabel('Descripción de la gestión').fill('Comunicación simulada E2E '+id);
  await section.getByRole('button',{name:'Registrar coordinación'}).click();await section.getByText('Comunicación simulada E2E '+id,{exact:true}).waitFor({timeout:30000});
  await section.getByRole('button',{name:'Actualizar gestión'}).click();await section.getByLabel('Estado de seguimiento').selectOption('CONFIRMADO');
  await section.getByLabel('Contacto de coordinación').fill('Contacto E2E ficticio');await section.getByLabel('Canal de comunicación').fill('Simulación E2E');await section.getByLabel('Fecha y hora de comunicación').fill('2025-01-01T12:00');await section.getByLabel('Fecha y hora de respuesta').fill('2025-01-01T12:15');await section.getByLabel('Fuente de la respuesta').fill('Prueba E2E simulada');await section.getByLabel('Referencia externa proporcionada').fill('E2E-SIMULADO');await section.getByLabel('Motivo del cambio').fill('Respuesta de prueba simulada');
  await section.getByRole('button',{name:'Guardar seguimiento'}).click();await section.getByText(/Respuesta declarada:/).waitFor({timeout:30000});
  const cmd=await login(t.commanders[i]),planning=cmd.getByRole('heading',{name:'Planificación operativa'}).locator('..');await planning.locator('select').first().selectOption(String(id),{timeout:30000});const read=planning.getByRole('heading',{name:'Coordinaciones aeroportuarias'}).locator('..');await read.getByText('Comunicación simulada E2E '+id,{exact:true}).waitFor({timeout:30000});await read.getByText(/Respuesta declarada:/).waitFor();if(await read.getByRole('button',{name:'Actualizar gestión'}).count())throw Error('Comandante tiene botón de edición');await cmd.close();await ops.close();
 }
 console.log('PASS Chrome: registro, respuesta E2E simulada y consulta de comandante en ambos tipos');
}finally{await browser.close();}});
