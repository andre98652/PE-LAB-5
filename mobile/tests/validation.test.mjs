import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, validateDistinctReason, friendlyError } from '../src/domain/models.ts';

const valid = { point: 'punto', location: 'Entrada del parque', description: 'Varias bolsas junto a la puerta.', type: 'basura', distinctReason: '' };
test('formulario rechaza espacios, tipos desconocidos y límites', () => {
  assert.equal(validateDraft(valid), null);
  assert.match(validateDraft({ ...valid, description: '          ' }), /descripción/);
  assert.match(validateDraft({ ...valid, location: 'x'.repeat(161) }), /lugar/);
  assert.match(validateDraft({ ...valid, type: 'toString' }), /tipo/);
  assert.match(validateDraft({ ...valid, point: '' }), /punto/);
});
test('explicar un problema distinto exige contenido suficiente', () => {
  assert.equal(validateDistinctReason('         '), false);
  assert.equal(validateDistinctReason('Otra esquina frente al colegio'), true);
  assert.equal(validateDistinctReason('x'.repeat(301)), false);
});
test('errores de red y acceso se presentan de forma comprensible', () => {
  assert.match(friendlyError(new Error('Network request failed')), /No hay conexión/);
  assert.match(friendlyError({ message: 'Invalid login credentials' }), /incorrectos/);
});
