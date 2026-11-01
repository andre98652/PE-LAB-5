import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validCoordinates, parseCoordinates, normalizeDistrict, distanceLabel } from '../src/domain/geo.ts';
import { validateGeoDraft } from '../src/domain/models.ts';
import { mapDocument } from '../src/components/mapDocument.ts';

test('coordenadas: límites, ceros, coma decimal y datos malformados', () => {
  assert.equal(validCoordinates({ latitude: 0, longitude: 0 }), true);
  for (const value of [null, {}, { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: Infinity }]) assert.equal(validCoordinates(value), false);
  assert.equal(parseCoordinates('', '0'), null);
  assert.equal(parseCoordinates('-12abc', '-77'), null);
  assert.deepEqual(parseCoordinates('-12,05', '-77,05'), { latitude: -12.05, longitude: -77.05 });
});
test('crear requiere punto confirmado y distrito; no usa un punto DEMO por defecto', () => {
  const draft = { geo: null, district: 'Comas, Lima', location: 'Entrada del parque', description: 'Varias bolsas junto al poste.', type: 'basura', distinctReason: '' };
  assert.match(validateGeoDraft(draft), /Confirma la ubicación/);
  assert.equal(validateGeoDraft({ ...draft, geo: { latitude: -12, longitude: -77, source: 'mapa', accuracy: null } }), null);
  assert.match(validateGeoDraft({ ...draft, district: ' ', geo: { latitude: -12, longitude: -77, source: 'mapa', accuracy: null } }), /distrito/);
});
test('distancias y distritos se presentan y normalizan de forma consistente', () => {
  assert.equal(distanceLabel(1000), '1.0 km');
  assert.equal(distanceLabel(29.9), '30 m');
  assert.equal(normalizeDistrict('  CÓMAS,  LIMA '), 'comas, lima');
});
test('mapa solo incluye coordenadas válidas y mantiene atribución y selección explícita', () => {
  const html = mapDocument({ center: { latitude: -12, longitude: -77 }, marker: null, interactive: true });
  assert.ok(html.includes('OpenStreetMap')); assert.ok(html.includes("map.on('click',pick)"));
  assert.ok(html.includes('let pin=null')); assert.equal(html.includes('sb_publishable'), false);
  const readonly = mapDocument({ center: { latitude: NaN, longitude: 0 }, marker: null, interactive: false });
  assert.equal(readonly.includes('NaN'), false); assert.equal(readonly.includes("map.on('click',pick)"), false);
});
