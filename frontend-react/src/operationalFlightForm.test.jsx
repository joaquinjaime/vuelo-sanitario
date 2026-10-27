import { expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { api } from './api';
import { OperationalApp, OperationalFlightForm } from './main';

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
