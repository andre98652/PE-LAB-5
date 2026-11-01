import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, colors, Field, styles } from './ui';

export function SelectField<T>({ label, value, options, onChange, disabled = false, placeholder = 'Seleccionar' }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean; placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find(option => option.value === value);
  function close() { setVisible(false); setSearch(''); }
  return <View>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`} accessibilityState={{ expanded: visible, disabled }}
      disabled={disabled} onPress={() => setVisible(true)} style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: selected ? colors.ink : colors.muted, flex: 1, fontSize: 15 }}>{selected?.label ?? placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.muted} />
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar selección" onPress={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: '80%', backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.heading}>{label}</Text><Button label="Cerrar" secondary onPress={close} /></View>
          {options.length > 6 ? <Field label="Buscar opción" value={search} onChangeText={setSearch} placeholder="Escribe para buscar" /> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {options.filter(option => option.label.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).map((option, index) => <Pressable key={index}
              accessibilityRole="button" accessibilityState={{ selected: option.value === value }} onPress={() => { onChange(option.value); close(); }}
              style={{ minHeight: 54, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Text style={[styles.text, { flex: 1, fontWeight: option.value === value ? '700' : '400' }]}>{option.label}</Text>
              {option.value === value ? <Ionicons name="checkmark" size={21} color={colors.green} /> : null}
            </Pressable>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
