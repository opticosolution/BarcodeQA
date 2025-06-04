import React, { useState, useContext, useEffect } from 'react';
import { View, StyleSheet, Animated, BackHandler } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import ThemeToggle from '../components/ThemeToggle';
import { ThemeContext } from '../ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { isDarkMode } = useContext(ThemeContext);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const [role, setRole] = useState('user');

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
    checkLoginStatus();
  }, [fadeAnim]);

  const checkLoginStatus = async () => {
    const token = await AsyncStorage.getItem('token');
    const user = await AsyncStorage.getItem('user');
    if (token && user) {
      const parsedUser = JSON.parse(user);
      if (parsedUser.role === 'admin') {
        navigation.replace('AdminDashboard');
      } else if (parsedUser.role === 'superadmin') {
        navigation.replace('SuperAdminDashboard');
      } else {
        navigation.replace('UserDashboard');
      }
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        return true; // Prevent back navigation
      };
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [])
  );

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background, opacity: fadeAnim }]}>
      <ThemeToggle style={styles.toggle} />
      <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : colors.text }]}>Digital BarCode Scanner</Text>
      <View style={[styles.pickerContainer, { backgroundColor: isDarkMode ? '#444' : '#fff' }]}>
        <Picker
          selectedValue={role}
          onValueChange={(itemValue) => setRole(itemValue)}
          style={[styles.picker, { color: isDarkMode ? '#FFFFFF' : colors.text }]}
          dropdownIconColor={isDarkMode ? '#FFFFFF' : colors.text}
        >
          <Picker.Item label="User" value="user" />
          <Picker.Item label="Admin" value="admin" />
          {/* <Picker.Item label="Super Admin" value="superadmin" /> */}
        </Picker>
      </View>
      <Button
        mode="contained"
        onPress={() => navigation.navigate('Login', { role })}
        style={styles.button}
        buttonColor={colors.primary}
        textColor={isDarkMode ? '#FFFFFF' : '#212121'}
        elevation={5}
      >
        Login
      </Button>
      <Button
        mode="contained"
        onPress={() => navigation.navigate('Register', { role })}
        style={styles.button}
        buttonColor={colors.accent}
        textColor={isDarkMode ? '#FFFFFF' : '#212121'}
        elevation={5}
      >
        Register
      </Button>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  toggle: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  pickerContainer: {
    width: '85%',
    borderRadius: 12,
    elevation: 4,
    marginBottom: 20,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  button: {
    marginVertical: 15,
    width: '85%',
    borderRadius: 12,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});