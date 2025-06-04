// O:/Barcode/barcodeapp/src/components/ThemeToggle.js
import React, { useContext } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ThemeContext } from '../ThemeContext';

export default function ThemeToggle() {
  const { isDarkMode, toggleTheme, theme } = useContext(ThemeContext);
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    Animated.timing(rotateAnim, {
      toValue: isDarkMode ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => toggleTheme());
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity onPress={handlePress} style={[styles.container, { backgroundColor: isDarkMode ? '#333' : '#f0f0f0' }]}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Icon
          name={isDarkMode ? 'lightbulb' : 'lightbulb-outline'}
          size={30}
          color={isDarkMode ? '#FFD700' : '#FF5722'}
          style={styles.icon}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  icon: {
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});