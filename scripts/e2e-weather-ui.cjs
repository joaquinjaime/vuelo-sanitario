const { chromium } = require('playwright');
let raw=''; process.stdin.setEncoding('utf8');
process.stdin.on('data', s => raw+=s);
process.stdin.on('end', async () => {
  const test=JSON.parse(raw);
  const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page=await browser.newPage();
    const adminRequests=[];
    page.on('request', r=>{if(/\/api\/(auth\/users$|catalogs\/aircraft\/admin$)/.test(r.url()))adminRequests.push(r.url());});
    page.on('pageerror', e => console.error('BROWSER ERROR:',e.message));
    await page.goto('http://127.0.0.1:18081/');
    await page.getByLabel('Usuario',{exact:true}).fill(test.username);
    await page.getByLabel('Contraseña',{exact:true}).fill(test.password);
    await page.getByRole('button',{name:'Iniciar sesión'}).click();
    const planning=page.getByRole('heading',{name:'Planificación operativa'}).locator('..');
    await planning.locator('select').first().selectOption(test.flightId,{timeout:30000});
    await page.getByText(test.apiConditions,{exact:true}).waitFor({timeout:30000});
    await page.getByLabel('Condiciones',{exact:true}).fill(test.uiConditions);
    await page.getByLabel('¿Condiciones favorables?').selectOption('false');
    await page.getByRole('button',{name:'Registrar clima'}).click();
    await page.getByText(/Condiciones meteorológicas registradas/).waitFor({timeout:30000});
    await page.getByRole('heading',{name:'Historial meteorológico'}).locator('..').getByText(test.uiConditions,{exact:true}).waitFor({timeout:30000});
    if(adminRequests.length)throw new Error('El comandante consultó recursos administrativos');
    const ops=await browser.newPage();
    await ops.goto('http://127.0.0.1:18081/');
    await ops.getByLabel('Usuario',{exact:true}).fill(test.opsUsername);
    await ops.getByLabel('Contraseña',{exact:true}).fill(test.password);
    await ops.getByRole('button',{name:'Iniciar sesión'}).click();
    const operations=ops.getByRole('heading',{name:'Centro de Operaciones'}).locator('..');
    await operations.locator('select').first().selectOption(test.flightId,{timeout:30000});
    await operations.getByRole('heading',{name:'Historial meteorológico'}).locator('..').getByText(test.uiConditions,{exact:true}).waitFor({timeout:30000});
    console.log('PASS: login real, lectura en Comandante y Operaciones, y registro desde interfaz');
  } finally { await browser.close(); }
});
