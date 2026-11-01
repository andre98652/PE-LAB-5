import { useState } from 'react';
import { View } from 'react-native';
import { Field } from './ui';
import { SelectField } from './SelectField';

export function DistrictField({ value, options, onChange, disabled = false }: {
  value: string; options: string[]; onChange: (district: string) => void; disabled?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const manual = custom || !options.length || (Boolean(value) && !options.includes(value));
  return <View style={{ gap: 10 }}>
    {options.length ? <SelectField label="Distrito" value={manual ? '__other__' : value} disabled={disabled} placeholder="Elige un distrito"
      options={[...options.map(district => ({ value: district, label: district })), { value: '__other__', label: 'Escribir otro distrito' }]}
      onChange={district => { if (district === '__other__') setCustom(true); else { setCustom(false); onChange(district); } }} /> : null}
    {manual ? <Field label="Distrito y provincia" value={value} onChangeText={onChange} maxLength={120} placeholder="Ej. Comas, Lima" editable={!disabled} /> : null}
  </View>;
}
