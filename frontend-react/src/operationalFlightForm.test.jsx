import React from 'react';
import { expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { api } from './api';
import { OperationalApp, OperationalAirportSelector, OperationalFlightForm } from './main';

vi.mock('./api', () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

test.each([[], {}, [{codigo:'', nombre:'Inválido'}]])('un catálogo vacío o inválido informa el error y bloquea la creación', async response => {
  vi.mocked(api).mockResolvedValue(response);
  render(<OperationalFlightForm d={{}} done={vi.fn()} msg={vi.fn()}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay un catálogo válido');
  expect(screen.getByRole('button', {name:'Crear vuelo operativo'})).toBeDisabled();
});

test('un error de carga se informa y bloquea la creación', async () => {
  vi.mocked(api).mockRejectedValue(new Error('No disponible'));
  render(<OperationalFlightForm d={{}} done={vi.fn()} msg={vi.fn()}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
  expect(screen.getByRole('button', {name:'Crear vuelo operativo'})).toBeDisabled();
});

test('el selector usa los valores recibidos del catálogo', async () => {
  vi.mocked(api).mockResolvedValue([{codigo:'TIPO_CATALOGO', nombre:'Tipo de prueba'}]);
  render(<OperationalFlightForm d={{}} done={vi.fn()} msg={vi.fn()}/>);
  expect(await screen.findByRole('option', {name:'Tipo de prueba'})).toHaveValue('TIPO_CATALOGO');
  expect(screen.getByLabelText('Tipo')).toHaveValue('TIPO_CATALOGO');
});

test('los catálogos disponibles no esperan una consulta de vuelos demorada', async () => {
  localStorage.setItem('vs-session', JSON.stringify({username:'operaciones',roles:['CENTRO_OPERACIONES']}));
  vi.mocked(api).mockImplementation(path => {
    if (path === '/flights') return new Promise(() => {});
    if (path === '/catalogs/aircraft') return Promise.resolve([{id:91,matricula:'LV-PRU',aeropuertoActual:'Base'}]);
    if (path === '/catalogs/flight-types?operationalOnly=true') return Promise.resolve([{codigo:'PRUEBA',nombre:'Prueba'}]);
    if (path === '/notifications') return Promise.resolve({items:[]});
    return Promise.resolve([]);
  });
  render(<OperationalApp workspace="OPERACIONES"/>);
  expect(await screen.findByRole('option',{name:'LV-PRU — Base'})).toHaveValue('91');
  localStorage.clear();
});

test('una respuesta antigua no reemplaza los catálogos de una actualización posterior', async () => {
  localStorage.setItem('vs-session', JSON.stringify({username:'operaciones',roles:['CENTRO_OPERACIONES']}));
  let resolveOld, calls=0;
  vi.mocked(api).mockImplementation(path => {
    if (path === '/catalogs/aircraft') {
      if (++calls === 1) return new Promise(resolve => { resolveOld=resolve; });
      return Promise.resolve([{id:92,matricula:'LV-NUE',aeropuertoActual:'Base'}]);
    }
    if (path === '/catalogs/flight-types?operationalOnly=true') return Promise.resolve([{codigo:'PRUEBA',nombre:'Prueba'}]);
    if (path === '/notifications') return Promise.resolve({items:[]});
    return Promise.resolve([]);
  });
  render(<OperationalApp workspace="OPERACIONES"/>);
  fireEvent.click(screen.getByRole('button',{name:'Actualizar'}));
  expect(await screen.findByRole('option',{name:'LV-NUE — Base'})).toHaveValue('92');
  await act(async () => resolveOld([{id:91,matricula:'LV-VIE',aeropuertoActual:'Base'}]));
  expect(screen.queryByRole('option',{name:'LV-VIE — Base'})).not.toBeInTheDocument();
  localStorage.clear();
});

test('el destino se busca en el catálogo activo y conserva la selección al cambiar la búsqueda', async () => {
  vi.mocked(api).mockImplementation(path => Promise.resolve(path.includes('Destino%20lejano') ? [{id:73,nombre:'Destino lejano'}] : []));
  function Harness(){const [value,setValue]=React.useState('');return <OperationalAirportSelector value={value} onChange={setValue}/>;}
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText('Buscar aeropuerto de destino'),{target:{value:'Destino lejano'}});
  expect(await screen.findByRole('option',{name:'Destino lejano'})).toHaveValue('73');
  fireEvent.change(screen.getByLabelText('Destino'),{target:{value:'73'}});
  fireEvent.change(screen.getByLabelText('Buscar aeropuerto de destino'),{target:{value:'Otra búsqueda'}});
  expect(screen.getByLabelText('Destino')).toHaveValue('73');
});

test('un tipo que dejó de estar activo se rechaza con el motivo del servidor y el catálogo se actualiza sin él', async () => {
  let loads = 0;
  vi.mocked(api).mockImplementation((path, options) => {
    if (path === '/catalogs/flight-types?operationalOnly=true') return Promise.resolve(++loads === 1 ? [{codigo:'VIEJO', nombre:'Tipo viejo'}, {codigo:'VIGENTE', nombre:'Tipo vigente'}] : [{codigo:'VIGENTE', nombre:'Tipo vigente'}]);
    if (path === '/flights/operational' && options?.method === 'POST') return Promise.reject(Object.assign(new Error('El tipo de vuelo está inactivo y no puede usarse en vuelos nuevos'), {code:'TIPO_VUELO_INACTIVO'}));
    return Promise.resolve([]);
  });
  const msg = vi.fn(), done = vi.fn();
  render(<OperationalFlightForm d={{aircraft:[{id:5,matricula:'LV-X',aeropuertoActual:'Base'}], commanders:[{id:6,nombre:'Ana',apellido:'Paz'}], airports:[{id:7,nombre:'Destino activo'}]}} done={done} msg={msg}/>);
  expect(await screen.findByRole('option', {name:'Tipo viejo'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Aeronave'), {target:{value:'5'}}); fireEvent.change(screen.getByLabelText('Comandante'), {target:{value:'6'}}); fireEvent.change(screen.getByLabelText('Destino'), {target:{value:'7'}});
  fireEvent.change(screen.getByLabelText('Motivo'), {target:{value:'Reposicionar la aeronave'}});
  fireEvent.change(screen.getByLabelText('Salida'), {target:{value:'2026-12-01T10:00'}}); fireEvent.change(screen.getByLabelText('Llegada'), {target:{value:'2026-12-01T12:00'}});
  fireEvent.click(screen.getByRole('button', {name:'Crear vuelo operativo'}));
  await vi.waitFor(() => expect(msg).toHaveBeenCalledWith('El tipo de vuelo está inactivo y no puede usarse en vuelos nuevos', true));
  expect(done).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(screen.queryByRole('option', {name:'Tipo viejo'})).not.toBeInTheDocument());
  expect(screen.getByLabelText('Tipo')).toHaveValue('VIGENTE');
});
