import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampoMonto } from '@/components/CampoMonto';
import { CrearCredito } from '@/paginas/CrearCredito';

// Formularios (reglas inline-validation y error-placement de la skill): el error aparece al salir
// del campo, debajo de él y enlazado con aria-describedby; el monto viaja exacto.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('campo de monto', () => {
  function Prueba() {
    const [valor, setValor] = useState('');
    return (
      <>
        <label htmlFor="monto">Monto</label>
        <CampoMonto id="monto" valor={valor} alCambiar={setValor} />
        <output>{valor}</output>
      </>
    );
  }

  it('muestra los separadores mientras se escribe y guarda el string exacto', async () => {
    render(<Prueba />);
    await userEvent.type(screen.getByLabelText('Monto'), '25000000,5');
    expect(screen.getByLabelText('Monto')).toHaveValue('25.000.000,5');
    expect(screen.getByRole('status')).toHaveTextContent('25000000.5');
  });
});

describe('formulario de crédito', () => {
  const catalogos = {
    tiposCredito: [{ codigo: 'LIBRE_INVERSION', nombre: 'Libre inversión' }],
    formasPago: [{ codigo: 'NOMINA', nombre: 'Descuento por nómina (libranza)' }],
    tiposIdentificacion: [
      { codigo: 'CC', nombre: 'Cédula de ciudadanía' },
      { codigo: 'PA', nombre: 'Pasaporte' },
    ],
    estados: ['SOLICITADO'],
  };

  function montar() {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: catalogos }), {
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CrearCredito />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('valida al salir del campo, con el mensaje de shared debajo y enlazado', async () => {
    montar();
    const identificacion = await screen.findByLabelText('Identificación');
    await userEvent.type(identificacion, '10A20');
    await userEvent.tab();

    const error = await screen.findByText('Con tipo CC la identificación solo admite dígitos');
    expect(identificacion).toHaveAttribute('aria-invalid', 'true');
    expect(identificacion.getAttribute('aria-describedby')).toBe(error.closest('[id]')?.id);
  });

  it('las cuotas fuera de rango y el valor en cero se rechazan antes de llamar a la API', async () => {
    montar();
    await userEvent.type(await screen.findByLabelText('Número de cuotas'), '400');
    await userEvent.type(screen.getByLabelText('Valor solicitado (COP)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar crédito' }));

    expect(
      await screen.findByText('El número de cuotas puede ser como máximo 360'),
    ).toBeInTheDocument();
    expect(screen.getByText('El valor solicitado debe ser mayor que 0')).toBeInTheDocument();
    // Solo se pidieron los catálogos: el formulario no se envió.
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url as string)).toEqual(['/api/catalogos']);
  });
});
