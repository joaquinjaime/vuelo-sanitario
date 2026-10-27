import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { api } from './api';
import { OperationalFlightForm } from './main';

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
