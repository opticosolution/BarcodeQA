// O:/Barcode/barcodeapp/src/components/CustomPicker.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker'; // Correct import
import { useTheme } from 'react-native-paper';

export default function CustomPicker({ selectedValue, onValueChange, items, style }) {
  const { colors } = useTheme();

  return (
    <View style={styles.pickerContainer}>
      <Picker
        selectedValue={selectedValue}
        onValueChange={onValueChange}
        style={[styles.picker, { color: colors.text }, style]}
        dropdownIconColor={colors.text}
      >
        {items.map((item, index) => (
          <Picker.Item key={index} label={item.label} value={item.value} />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    width: '80%',
    borderRadius: 8,
    backgroundColor: '#fff', // Default light background
    elevation: 2,
    marginVertical: 10,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
});